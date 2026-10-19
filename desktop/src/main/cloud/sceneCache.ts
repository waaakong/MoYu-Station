import { lstatSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseSceneCacheRecord, parseSceneCacheRequest, parseSceneSnapshot, SCENE_CACHE_LIMIT, type SceneCacheRecord } from '@studyroom/contracts';
import type { CloudClient } from './client';

/** Only the main-process cloud client establishes identity and downloads cache contents. */
export class PrivateSceneCache {
  private owner: string | null = null;
  private generation = 0;
  private revoked = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private root: string;
  constructor(root: string, private client: Pick<CloudClient, 'request' | 'media'>) { this.root = resolve(root); }

  setOwner(value: string | null) {
    if (value === this.owner) return;
    const previous = this.owner; this.owner = value; this.generation++;
    if (previous) {
      this.revoked.add(previous);
      // Persist revocation before asynchronous cleanup; restart must never revive a blocked record.
      try { writeFileSync(join(this.directory(previous), 'blocked'), '1', { flag: 'w' }); } catch { /* Fail closed in memory; purge is retried by subsequent operations. */ }
      void this.serial(() => this.purge(previous)).catch(() => {});
    }
  }

  private directory(owner: string): string {
    if (!/^[1-9][0-9]{0,18}$/.test(owner)) throw new Error('SCENE_CACHE_OWNER_INVALID');
    // Validate every ancestor before creating anything: never follow junctions/symlinks.
    const parts: string[] = []; let path = this.root;
    while (true) { parts.unshift(path); const parent = resolve(path, '..'); if (parent === path) break; path = parent; }
    for (const part of [...parts, join(this.root, owner)]) {
      if (!existsSync(part)) mkdirSync(part);
      const info = lstatSync(part);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('SCENE_CACHE_DIRECTORY_UNSAFE');
    }
    const directory = join(this.root, owner);
    for (const name of ['record.json', 'record.next', 'blocked']) {
      const file = join(directory, name);
      try { const info = lstatSync(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('SCENE_CACHE_FILE_UNSAFE'); }
      catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    return directory;
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action, action); this.queue = next.catch(() => {}); return next;
  }
  private async purge(owner: string) {
    const directory = this.directory(owner);
    // Only these application-owned filenames are ever removed; never recurse or touch original uploads.
    for (const name of ['record.next', 'record.json', 'blocked']) {
      try { await unlink(join(directory, name)); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    this.revoked.delete(owner);
  }

  async request(input: unknown): Promise<SceneCacheRecord | null> {
    const request = parseSceneCacheRequest(input);
    // Erasing app-generated cache is allowed after logout/restart; it grants no read access.
    if (request.action !== 'clear' && request.owner !== this.owner) throw new Error('SCENE_CACHE_ACCOUNT_CHANGED');
    const generation = this.generation;
    const guard = () => { if (generation !== this.generation || request.owner !== this.owner) throw new Error('SCENE_CACHE_ACCOUNT_CHANGED'); };
    if (request.action === 'clear') {
      this.revoked.add(request.owner);
      if(request.owner===this.owner){this.owner=null;this.generation++;}
      if(!existsSync(join(this.root,request.owner)))return null;
      writeFileSync(join(this.directory(request.owner), 'blocked'), '1', { flag: 'w' });
      return this.serial(async () => { await this.purge(request.owner); return null; });
    }
    return this.serial(async () => {
      guard(); const directory = this.directory(request.owner);
      const blocked = this.revoked.has(request.owner) || existsSync(join(directory, 'blocked'));
      if (request.action === 'read') {
        if (blocked) return null;
        const result = await this.read(directory); guard(); return result;
      }
      if (blocked) await this.purge(request.owner);
      guard();
      const response = await this.client.request({ method: 'GET', path: '/scenes/custom' }); guard();
      const body = response.data as any;
      if (response.status !== 200 || body?.success !== true) throw new Error('SCENE_CACHE_UNCONFIRMED');
      const snapshot = parseSceneSnapshot(body.data);
      let previous: SceneCacheRecord | null = null;
      try { previous = await this.read(directory); } catch { /* A verified cloud snapshot can replace a corrupt cache. */ }
      guard();
      if (previous && previous.snapshot.version > snapshot.version) throw new Error('SCENE_CACHE_STALE_SNAPSHOT');
      const images: SceneCacheRecord['images'] = [];
      for (const item of snapshot.media) {
        const old = previous?.images.find(image => image.assetId === item.assetId);
        if (old) { images.push(old); continue; }
        const media = await this.client.media(item.displayUrl); guard();
        if (!media.ok) throw new Error('SCENE_CACHE_DOWNLOAD_FAILED');
        images.push({ assetId: item.assetId, mime: media.headers.get('content-type') || '', bytes: new Uint8Array(await media.arrayBuffer()) });
        guard();
      }
      const result = parseSceneCacheRecord({ snapshot, images });
      const encoded = JSON.stringify({ format: 1, snapshot: result.snapshot, images: result.images.map(image => ({ ...image, bytes: Buffer.from(image.bytes).toString('base64') })) });
      // Account for both old and atomic replacement files, including base64 and metadata overhead.
      if (Buffer.byteLength(encoded) > SCENE_CACHE_LIMIT / 2) throw new Error('SCENE_CACHE_QUOTA');
      guard(); await writeFile(join(directory, 'record.next'), encoded, { flag: 'w' }); guard();
      await rename(join(directory, 'record.next'), join(directory, 'record.json')); guard();
      return result;
    });
  }

  private async read(directory: string): Promise<SceneCacheRecord | null> {
    const file = join(directory, 'record.json');
    try {
      if ((await stat(file)).size > SCENE_CACHE_LIMIT / 2) throw new Error('SCENE_CACHE_QUOTA');
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (value.format !== 1 || !Array.isArray(value.images) || value.images.length > 8) throw new Error('SCENE_CACHE_FORMAT');
      return parseSceneCacheRecord({ snapshot: value.snapshot, images: value.images.map((image: any) => ({ ...image, bytes: new Uint8Array(Buffer.from(image.bytes, 'base64')) })) });
    } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
  }
}
