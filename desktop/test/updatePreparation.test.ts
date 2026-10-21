import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdatePreparation } from '../src/updater/updatePreparation';
import { updatePreparationResultSchema } from '../src/main/ipc/validation';
const windowMock = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('accepts only the live one-use request and returns the host freeze release', async () => {
  const window = windowMock(), release = vi.fn(), backup = vi.fn(() => release);
  const preparation = new UpdatePreparation(window as never, backup);
  const pending = preparation.prepare(new AbortController().signal);
  const id = window.webContents.send.mock.calls[0]![1].id;
  expect(() => preparation.complete({ id: 'another-request', ready: true })).toThrow('UPDATE_SAVE_UNAVAILABLE');
  preparation.complete({ id, ready: true, rendererState: { 'studyroom-focus-session-v2': '{}' } });
  expect(await pending).toBe(release); expect(backup).toHaveBeenCalledOnce();
  expect(() => preparation.complete({ id, ready: true })).toThrow('UPDATE_SAVE_UNAVAILABLE');
});

it.each(['abort', 'timeout', 'decline'] as const)('does not back up or freeze after %s', async reason => {
  const window = windowMock(), backup = vi.fn(() => vi.fn()), controller = new AbortController();
  const preparation = new UpdatePreparation(window as never, backup);
  const pending = preparation.prepare(controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  const id = window.webContents.send.mock.calls[0]![1].id;
  if (reason === 'abort') controller.abort();
  else if (reason === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
  else preparation.complete({ id, ready: false });
  await rejected;
  expect(backup).not.toHaveBeenCalled();
  expect(() => preparation.complete({ id, ready: true })).toThrow('UPDATE_SAVE_UNAVAILABLE');
});

it('rejects free-form fields, paths, URLs and credential backup keys at the IPC boundary', () => {
  const valid = { id: '11111111-1111-4111-8111-111111111111', ready: true, rendererState: { 'studyroom-shell-preferences-v2': '{}' } };
  expect(updatePreparationResultSchema.safeParse(valid).success).toBe(true);
  for (const key of ['password', 'https://example.test', '../outside', 'session-token']) {
    expect(updatePreparationResultSchema.safeParse({ ...valid, rendererState: { [key]: 'secret' } }).success).toBe(false);
  }
  expect(updatePreparationResultSchema.safeParse({ ...valid, path: 'C:/outside' }).success).toBe(false);
});

it.each([
  [Object.assign(new Error('EEXIST: synthetic occupied backup directory'), {code:'EEXIST'}), 'UPDATE_SAVE_UNAVAILABLE'],
  [Object.assign(new Error('EACCES: synthetic backup write denied'), {code:'EACCES'}), 'UPDATE_SAVE_UNAVAILABLE'],
  [new Error('UPDATE_BACKUP_INVALID'), 'UPDATE_SAVE_UNAVAILABLE'],
  [Object.assign(new Error('ENOSPC: synthetic disk full'), {code:'ENOSPC'}), 'UPDATE_DISK_INSUFFICIENT'],
  [new Error('SQLITE_FULL: database or disk is full'), 'UPDATE_DISK_INSUFFICIENT']
])('classifies real save/backup errors without reporting a network failure: %s', async(error, expected) => {
  const window = windowMock(), release = vi.fn(), backup = vi.fn<() => () => void>();
  backup.mockImplementationOnce(() => { throw error; }).mockReturnValueOnce(release);
  const preparation = new UpdatePreparation(window as never, backup);
  const first = preparation.prepare(new AbortController().signal);
  const rejected = expect(first).rejects.toThrow(expected);
  const id = window.webContents.send.mock.calls[0]![1].id;
  preparation.complete({id,ready:true});await rejected;
  // A failed preparation must not strand a pending request or block fresh work.
  const next = preparation.prepare(new AbortController().signal);
  const nextId = window.webContents.send.mock.calls[1]![1].id;
  expect(nextId).not.toBe(id);preparation.complete({id:nextId,ready:true});
  expect(await next).toBe(release);
});
