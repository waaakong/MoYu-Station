import { describe, expect, it, vi } from 'vitest';
import { allowedUpdateUrl, canFallbackToServer, fetchUpdateFeed, githubFeedUrl, updateHeaders } from '../src/updater/updateTransport';
import { releaseManifestSchema } from '../src/updater/updateSecurity';

const manifest = releaseManifestSchema.parse({ schemaVersion: 2, releaseId: 'stable-0.3.0', channel: 'stable', version: '0.3.0',
  platform: 'win32', arch: 'x64', appId: 'xyz.moyustation.studyroom', artifactKey: 'stable/0.3.0', publishedAt: '2026-10-19T00:00:00Z',
  github: { repository: 'waaakong/StudyRoom', tag: 'v0.3.0' }, files: [
    { name: 'latest.yml', size: 100, sha512: Buffer.alloc(64, 1).toString('base64'), role: 'feed' },
    { name: 'MoYu-Setup-0.3.0-win-x64.exe', size: 1000, sha512: Buffer.alloc(64, 2).toString('base64'), role: 'installer' }
  ] });
const feed = githubFeedUrl('waaakong/StudyRoom', 'v0.3.0');
const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/123/asset?signature=synthetic';

describe('pinned GitHub transport', () => {
  it('allows only the signed release files and known HTTPS release CDN', () => {
    expect(allowedUpdateUrl(feed + 'latest.yml?noCache=1', manifest, feed)).toBe(true);
    expect(allowedUpdateUrl(cdn, manifest, feed)).toBe(true);
    for (const url of [feed.replace('v0.3.0', 'latest') + 'latest.yml', feed.replace('StudyRoom', 'other') + 'latest.yml',
      feed + 'unlisted.exe', 'http://github.com/waaakong/StudyRoom/releases/download/v0.3.0/latest.yml',
      'https://release-assets.githubusercontent.com.evil.test/github-production-release-asset/x',
      'https://github.com:444/waaakong/StudyRoom/releases/download/v0.3.0/latest.yml',
      'https://user@release-assets.githubusercontent.com/github-production-release-asset/x']) {
      expect(allowedUpdateUrl(url, manifest, feed), url).toBe(false);
    }
  });
  it('follows a bounded CDN redirect with no application authorization or cookies', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, {status:302, headers:{location:cdn}}))
      .mockResolvedValueOnce(new Response('feed'));
    expect(await (await fetchUpdateFeed(fetcher, manifest, feed, 'synthetic-secret', new AbortController().signal)).text()).toBe('feed');
    for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ headers: {}, credentials:'omit', redirect:'manual' });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('synthetic-secret');
  });
  it('rejects foreign, insecure and looping redirects before fetching the target', async () => {
    for (const target of ['https://evil.test/asset','http://github.com/asset']) {
      const fetcher = vi.fn().mockResolvedValue(new Response(null, {status:302, headers:{location:target}}));
      await expect(fetchUpdateFeed(fetcher, manifest, feed, '', new AbortController().signal)).rejects.toThrow('UPDATE_FEED_URL_BLOCKED');
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const looping = vi.fn().mockImplementation(async () => new Response(null, {status:302, headers:{location:cdn}}));
    await expect(fetchUpdateFeed(looping, manifest, feed, '', new AbortController().signal)).rejects.toThrow('UPDATE_FEED_URL_BLOCKED');
    expect(looping).toHaveBeenCalledTimes(5);
  });
  it('never redirects a protected server request or transfers its grant to GitHub', async () => {
    const server = 'https://moyustation.xyz/private-updates/releases/stable/0.3.0/';
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status:302, headers:{location:feed+'latest.yml'}}));
    await expect(fetchUpdateFeed(fetcher, manifest, server, 'synthetic-grant', new AbortController().signal)).rejects.toThrow('UPDATE_FEED_URL_BLOCKED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(updateHeaders(manifest, server, 'synthetic-grant')).toEqual({Authorization:'Bearer synthetic-grant'});
  });
  it('allows bounded network fallback but not integrity, identity or login failures', () => {
    for (const error of ['UPDATE_HTTP_404','UPDATE_HTTP_429','UPDATE_HTTP_503','503 Service Unavailable','HttpError: 429 Too Many Requests','net::ERR_CONNECTION_RESET','net::ERR_INTERNET_DISCONNECTED','fetch failed','request timeout']) expect(canFallbackToServer(new Error(error))).toBe(true);
    for (const error of ['UPDATE_ARTIFACT_HASH_FAILED','UPDATE_MANIFEST_SIGNATURE_INVALID','UPDATE_FEED_URL_BLOCKED','UPDATE_HTTP_401','UPDATE_HTTP_403']) expect(canFallbackToServer(new Error(error))).toBe(false);
  });
});
