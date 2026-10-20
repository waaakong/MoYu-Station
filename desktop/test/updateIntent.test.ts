import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateIntent, type UpdateIntentOperations, type UpdateTarget } from '../src/updater/updateIntent';

function setup() {
  let target: UpdateTarget | undefined = { accountSession: 'account-1:epoch-3', version: '0.3.0', manifestDigest: 'a'.repeat(64) };
  const release = vi.fn();
  const operations: UpdateIntentOperations = {
    currentTarget: () => target, download: vi.fn(async () => {}), revalidate: vi.fn(async () => {}),
    prepare: vi.fn(async () => release), verifyArtifact: vi.fn(async () => {}), install: vi.fn(async () => {}), changed: vi.fn()
  };
  return { intent: new UpdateIntent(operations), operations, release, setTarget: (value?: UpdateTarget) => { target = value; } };
}

describe('process-local one-click update authorization', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('downloads, waits five seconds, saves, verifies again and installs without a second click', async () => {
    const { intent, operations } = setup();
    await intent.start();
    expect(intent.snapshot()).toMatchObject({ phase: 'countdown', countdownSeconds: 5 });
    await vi.advanceTimersByTimeAsync(4999);
    expect(operations.install).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(operations.revalidate).toHaveBeenCalledTimes(2);
    expect(operations.prepare).toHaveBeenCalledOnce();
    expect(operations.verifyArtifact).toHaveBeenCalledOnce();
    expect(operations.install).toHaveBeenCalledOnce();
    expect(vi.mocked(operations.prepare).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(operations.install).mock.invocationCallOrder[0]!);
  });

  it.each(['focus', 'audio', 'drafts'] as const)('waits for %s and resets the countdown if work restarts', async reason => {
    const { intent, operations } = setup();
    const idle = { focus: false, audio: false, drafts: false };
    intent.setBusy({ ...idle, [reason]: true }); await intent.start();
    expect(intent.snapshot()).toMatchObject({ phase: 'waiting', waitReasons: [reason] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(operations.install).not.toHaveBeenCalled();
    intent.setBusy(idle); await vi.advanceTimersByTimeAsync(4000);
    intent.setBusy({ ...idle, [reason]: true }); intent.setBusy(idle);
    await vi.advanceTimersByTimeAsync(4999); expect(operations.install).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(operations.install).toHaveBeenCalledOnce();
  });

  it('rejects a late download callback after cancel, even if another click is made', async () => {
    const { intent, operations } = setup();
    let finish!: () => void;
    vi.mocked(operations.download).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = intent.start(); intent.cancel(); await intent.start(); finish(); await first;
    await vi.advanceTimersByTimeAsync(5000);
    expect(operations.install).toHaveBeenCalledOnce();
  });

  it.each(['logout', 'account', 'version', 'manifest'] as const)('revokes on %s before installation', async kind => {
    const { intent, operations, setTarget } = setup(); await intent.start();
    setTarget(kind === 'logout' ? undefined : {
      accountSession: kind === 'account' ? 'account-2:epoch-1' : 'account-1:epoch-3',
      version: kind === 'version' ? '0.4.0' : '0.3.0', manifestDigest: (kind === 'manifest' ? 'b' : 'a').repeat(64)
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(operations.install).not.toHaveBeenCalled(); expect(intent.snapshot().phase).toBe('idle');
  });

  it.each(['prepare', 'verifyArtifact', 'install'] as const)('restores current app after %s failure', async operation => {
    const { intent, operations, release } = setup();
    vi.mocked(operations[operation]).mockRejectedValueOnce(new Error('EXPECTED_FAILURE'));
    await intent.start(); await vi.advanceTimersByTimeAsync(5000);
    expect(intent.snapshot()).toMatchObject({ phase: 'error', error: 'EXPECTED_FAILURE' });
    if (operation !== 'prepare') expect(release).toHaveBeenCalledOnce();
    if (operation !== 'install') expect(operations.install).not.toHaveBeenCalled();
  });

  it('releases a late save result after ordinary quit and never reuses an intent after restart', async () => {
    const { intent, operations, release } = setup();
    let saved!: (value: () => void) => void;
    vi.mocked(operations.prepare).mockImplementationOnce(() => new Promise(resolve => { saved = resolve; }));
    await intent.start(); await vi.advanceTimersByTimeAsync(5000); intent.dispose(); saved(release);
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce(); expect(operations.install).not.toHaveBeenCalled();
    const next = new UpdateIntent(operations); await vi.advanceTimersByTimeAsync(60_000);
    expect(next.snapshot().phase).toBe('idle'); expect(operations.install).not.toHaveBeenCalled();
  });
});
