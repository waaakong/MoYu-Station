import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateSceneCache } from '../src/main/cloud/sceneCache';
import { parseSceneCacheRecord, parseSceneCacheRequest, SCENE_DISPLAY_LIMIT } from '@studyroom/contracts';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = () => ({ version: 1, deleted: false, config: { name: 'Fixture', defaultImage: { assetId: id, fit: 'contain', focalX: .5, focalY: .5, zoom: 1, dim: .2 }, periods: {} },
  media: [{ assetId: id, width: 600, height: 1000, bytes: 20, clearUrl: `/api/media/assets/${id}/clear`, displayUrl: `/api/media/assets/${id}/display`, thumbUrl: `/api/media/assets/${id}/thumb` }] });
const media = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
const request = async () => ({ status: 200, retryAfter: '', data: { success: true, data: snapshot() } });
const root = () => mkdtemp(join(tmpdir(), 'studyroom-scene-cache-test-'));

describe('main-owned private scene cache', () => {
  it('rejects arbitrary owners, paths and excess images at the boundary', () => {
    for (const value of [{ action: 'read', owner: '../1' }, { action: 'refresh', owner: '1', url: 'https://bad.invalid' }, { action: 'read', owner: 1 }]) expect(() => parseSceneCacheRequest(value)).toThrow();
    expect(() => parseSceneCacheRecord({ snapshot: snapshot(), images: [{ assetId: id, mime: 'image/png', bytes: new Uint8Array(SCENE_DISPLAY_LIMIT + 1) }] })).toThrow();
  });
  it('persists only verified snapshots and requires reverified identity after process restart', async () => {
    const directory = await root(), cache = new PrivateSceneCache(directory, { request, media });
    await expect(cache.request({ action: 'read', owner: '1' })).rejects.toThrow('ACCOUNT_CHANGED');
    cache.setOwner('1'); const saved = await cache.request({ action: 'refresh', owner: '1' });
    expect(saved?.snapshot.config?.defaultImage.fit).toBe('contain');
    const restarted = new PrivateSceneCache(directory, { request, media });
    await expect(restarted.request({ action: 'read', owner: '1' })).rejects.toThrow();
    restarted.setOwner('1'); expect((await restarted.request({ action: 'read', owner: '1' }))?.images[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    await expect(restarted.request({ action: 'read', owner: '2' })).rejects.toThrow();
  });
  it('clears app-generated cache idempotently without deleting another account or original files', async () => {
    const directory = await root(), cache = new PrivateSceneCache(directory, { request, media });
    cache.setOwner('1'); await cache.request({ action: 'refresh', owner: '1' });
    await writeFile(join(directory, '1', 'user-original.png'), 'never delete');
    await cache.request({ action: 'clear', owner: '1' }); await cache.request({ action: 'clear', owner: '1' });
    expect(await readFile(join(directory, '1', 'user-original.png'), 'utf8')).toBe('never delete');
    cache.setOwner('1'); expect(await cache.request({ action: 'read', owner: '1' })).toBeNull();
  });
  it('does not publish an in-flight image after logout', async () => {
    let release!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const directory = await root(), cache = new PrivateSceneCache(directory, { request, media: () => pending });
    cache.setOwner('1'); const writing = cache.request({ action: 'refresh', owner: '1' });
    const rejected = expect(writing).rejects.toThrow('ACCOUNT_CHANGED');
    await new Promise(resolve => setTimeout(resolve, 10)); cache.setOwner(null); release(await media()); await rejected;
    await cache.request({ action: 'clear', owner: '1' }); cache.setOwner('1');
    expect(await cache.request({ action: 'read', owner: '1' })).toBeNull();
  });
  it('blocked cleanup survives restart and a cloud failure does not resurrect the record', async () => {
    const directory = await root(), cache = new PrivateSceneCache(directory, { request, media });
    cache.setOwner('1'); await cache.request({ action: 'refresh', owner: '1' }); await writeFile(join(directory, '1', 'blocked'), '1');
    const restarted = new PrivateSceneCache(directory, { request: async () => { throw new Error('offline'); }, media }); restarted.setOwner('1');
    expect(await restarted.request({ action: 'read', owner: '1' })).toBeNull();
    await expect(restarted.request({ action: 'refresh', owner: '1' })).rejects.toThrow('offline');
    expect(await restarted.request({ action: 'read', owner: '1' })).toBeNull();
  });
  it('rejects junctions instead of following them during cleanup', async () => {
    const directory = await root(), outside = await root(); await mkdir(join(directory, 'accounts'));
    await writeFile(join(outside, 'record.json'), 'keep');
    await symlink(outside, join(directory, 'accounts', '1'), 'junction');
    const cache = new PrivateSceneCache(join(directory, 'accounts'), { request, media }); cache.setOwner('1');
    await expect(cache.request({ action: 'clear', owner: '1' })).rejects.toThrow('UNSAFE');
    expect(await readFile(join(outside, 'record.json'), 'utf8')).toBe('keep');
  });
});
