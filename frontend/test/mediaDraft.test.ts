import { describe, expect, it, vi } from 'vitest';
import { MediaDraft } from '../src/media/mediaDraft';
import { MediaApi, type MediaTransport } from '../src/media/mediaApi';
import { ImageUploadQueue } from '../src/media/imageUploadQueue';
const asset = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(transport: MediaTransport) {
  let current: { accountId: string; generation: number } | null = { accountId: '1', generation: 1 };
  const api = new MediaApi(current, () => current, transport); let sequence = 0;
  const draft = new MediaDraft(api, { accountId: '1', target: { kind: 'private', recipientId: '2' } }, {
    prepare: async file => file, upload: async () => ({ id: asset(++sequence), expiresAt: Date.now() + 60000 }), lookup: async () => ({ status: 'missing' }),
    createPreview: () => 'blob:fixture', revokePreview: vi.fn()
  });
  const add = async (count = 2) => { draft.add(Array.from({ length: count }, () => new File(['x'], 'fixture.png', { type: 'image/png' }))); await vi.waitFor(() => expect(draft.snapshot().items.every(item => item.status === 'ready')).toBe(true)); };
  return { draft, add, invalidate: () => { current = null; draft.dispose(); } };
}
const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });
describe('media draft publication batch', () => {
  it('page preview decodes only the processed candidate and releases it on disposal', async () => {
    const candidate = new File(['qualified'], 'candidate.png', { type: 'image/png' });
    let finish!: (file: File) => void;
    const createPreview = vi.fn(() => 'blob:qualified'), revokePreview = vi.fn();
    const queue = new ImageUploadQueue({ accountId: '1', target: { kind: 'feed' } }, {
      prepare: () => new Promise(resolve => { finish = resolve; }), previewAfterPrepare: true, createPreview, revokePreview,
      upload: async () => ({ id: asset(1), expiresAt: null }), lookup: async () => ({ status: 'missing' })
    });
    queue.add([new File(['source'], 'source.png', { type: 'image/png' })]);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('processing'));
    expect(createPreview).not.toHaveBeenCalled(); expect(queue.snapshot()[0].previewUrl).toBe('');
    finish(candidate); await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('ready'));
    expect(createPreview).toHaveBeenCalledExactlyOnceWith(candidate);
    queue.dispose(); expect(revokePreview).toHaveBeenCalledExactlyOnceWith('blob:qualified');
  });
  it('only sends on explicit confirmation, freezes all tasks, and recovers a partial batch without repeating its first message', async () => {
    const transport = vi.fn<MediaTransport>().mockResolvedValueOnce(ok({ kind: 'PRIVATE', targetId: 1 })).mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(ok({ status: 'committed', publication: { kind: 'PRIVATE', targetId: 2 } }));
    const { draft, add } = fixture(transport); await add(); expect(transport).not.toHaveBeenCalled();
    await expect(draft.submit('first caption', null)).rejects.toThrow('timeout');
    expect(draft.snapshot()).toMatchObject({ state: 'unknown', completed: 1, total: 2, locked: true });
    expect(() => draft.remove(draft.snapshot().items[0].id)).toThrow('不能修改');
    const results = await draft.submit('changed content must not be used', null);
    expect(results.map(item => item.targetId)).toEqual(["1", "2"]);
    expect(transport.mock.calls.map(([request]) => request.method)).toEqual(['POST','POST','GET']);
    const bodies = transport.mock.calls.slice(0, 2).map(([request]) => JSON.parse(request.body as string));
    expect(bodies.map(body => body.recipient)).toEqual(['2','2']); expect(bodies.map(body => body.content)).toEqual(['first caption','']);
    draft.dispose();
  });
  it('waits for all uploads and sends assets in user order', async () => {
    const transport = vi.fn<MediaTransport>().mockResolvedValue(ok({ kind: 'PRIVATE', targetId: 1 }));
    const { draft, add } = fixture(transport); await expect(draft.submit('', null)).rejects.toThrow('添加'); await add();
    const before = draft.snapshot().items; draft.reorder(before.map(item => item.id).reverse());
    await draft.submit('', null);
    expect(transport.mock.calls.map(([request]) => JSON.parse(request.body as string).assets[0])).toEqual(before.map(item => item.asset!.id).reverse()); draft.dispose();
  });
  it('does not send the next message after session invalidation during an in-flight request', async () => {
    let finish!: (value: ReturnType<typeof ok>) => void;
    const transport = vi.fn<MediaTransport>(() => new Promise(resolve => { finish = resolve; }));
    const { draft, add, invalidate } = fixture(transport); await add();
    const pending = draft.submit('', null); const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    invalidate(); finish(ok({ kind: 'PRIVATE', targetId: 1 })); await failure;
    expect(transport).toHaveBeenCalledOnce(); expect(draft.snapshot().state).toBe('disposed');
  });
  it('coalesces duplicate confirmation clicks and stops after a definitive rejection', async () => {
    const transport = vi.fn<MediaTransport>().mockRejectedValue({ status: 403, code: 'MEDIA_PUBLICATION_FORBIDDEN' });
    const { draft, add } = fixture(transport); await add();
    const first = draft.submit('', null); expect(draft.submit('duplicate', null)).toBe(first);
    await expect(first).rejects.toThrow(); expect(draft.snapshot().state).toBe('rejected');
    await expect(draft.submit('', null)).rejects.toThrow('任务已结束'); expect(transport).toHaveBeenCalledOnce(); draft.dispose();
  });
});
