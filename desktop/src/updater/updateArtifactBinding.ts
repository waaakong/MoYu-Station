import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { ReleaseManifest } from './updateSecurity';

const MAX_FEED_BYTES = 128 * 1024;
type Entry = ReleaseManifest['files'][number];
function entry(manifest: ReleaseManifest, role: Entry['role']): Entry {
  const value = manifest.files.find(file => file.role === role);
  if (!value) throw new Error('UPDATE_MANIFEST_FILES_INVALID');
  return value;
}

/** Check raw feed bytes before letting the updater parse any server metadata. */
export async function verifyFeedResponse(response: Response, manifest: ReleaseManifest, signal: AbortSignal): Promise<void> {
  const expected = entry(manifest, 'feed');
  if (!response.ok) throw new Error(`UPDATE_HTTP_${response.status}`);
  if (response.redirected || expected.size > MAX_FEED_BYTES || !response.body) throw new Error('UPDATE_MANIFEST_INVALID');
  const reader = response.body.getReader(), hash = createHash('sha512');
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > expected.size || size > MAX_FEED_BYTES) throw new Error('UPDATE_ARTIFACT_HASH_FAILED');
      hash.update(chunk.value);
    }
    signal.throwIfAborted();
    if (size !== expected.size || hash.digest('base64') !== expected.sha512) throw new Error('UPDATE_ARTIFACT_HASH_FAILED');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}

/** Also check the metadata fetched by electron-updater, closing the second-fetch race. */
export function verifyUpdateInfo(info: unknown, manifest: ReleaseManifest, feedUrl: string): void {
  const value = info as {version?: unknown; files?: Array<{url?: unknown;sha512?: unknown;size?: unknown}>;packages?: unknown;path?: unknown;sha512?: unknown};
  const expected = entry(manifest, 'installer');
  if (!value || value.version !== manifest.version || value.packages || !Array.isArray(value.files) || value.files.length !== 1) throw new Error('UPDATE_MANIFEST_MISMATCH');
  const file = value.files[0]!;
  const expectedUrl = new URL(expected.name, feedUrl).href;
  const matchesUrl = (url: unknown) => typeof url === 'string' && new URL(url, feedUrl).href === expectedUrl;
  if (!matchesUrl(file.url) || file.sha512 !== expected.sha512 || file.size !== expected.size ||
      (value.path !== undefined && !matchesUrl(value.path)) || (value.sha512 !== undefined && value.sha512 !== expected.sha512)) {
    throw new Error('UPDATE_ARTIFACT_HASH_FAILED');
  }
}

/** Independently check the actual file, including cached downloads, against the signed manifest. */
export async function verifyDownloadedInstaller(paths: string[], manifest: ReleaseManifest, signal: AbortSignal): Promise<void> {
  if (!Array.isArray(paths) || paths.length !== 1) throw new Error('UPDATE_MANIFEST_FILES_INVALID');
  const expected = entry(manifest, 'installer'), hash = createHash('sha512');
  let size = 0;
  const stream = createReadStream(paths[0]!, {signal});
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > expected.size) throw new Error('UPDATE_ARTIFACT_HASH_FAILED');
    hash.update(chunk);
  }
  signal.throwIfAborted();
  if (size !== expected.size || hash.digest('base64') !== expected.sha512) throw new Error('UPDATE_ARTIFACT_HASH_FAILED');
}
