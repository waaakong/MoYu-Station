import type { ReleaseManifest } from './updateSecurity';

export function githubFeedUrl(repository: string, tag: string): string {
  return `https://github.com/${repository}/releases/download/${tag}/`;
}

export function isGithubFeed(manifest: ReleaseManifest, feedUrl: string): boolean {
  return manifest.schemaVersion === 2 && feedUrl === githubFeedUrl(manifest.github.repository, manifest.github.tag);
}

/** One pinned Release, or the original authenticated server. No arbitrary URL from IPC. */
export function allowedUpdateUrl(raw: string, manifest: ReleaseManifest, feedUrl: string): boolean {
  try {
    const url = new URL(raw), base = new URL(feedUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    if (isGithubFeed(manifest, feedUrl)) {
      if (url.port) return false;
      if (url.hostname === 'release-assets.githubusercontent.com') {
        return url.pathname.startsWith('/github-production-release-asset/');
      }
      if (url.hostname === 'objects.githubusercontent.com') {
        return url.pathname.startsWith('/github-production-release-asset-');
      }
    }
    return url.origin === base.origin && manifest.files.some(file => url.pathname === new URL(file.name, base).pathname);
  } catch { return false; }
}

export function updateHeaders(manifest: ReleaseManifest, feedUrl: string, accessToken: string): Record<string, string> {
  return isGithubFeed(manifest, feedUrl) ? {} : { Authorization: `Bearer ${accessToken}` };
}

/** Explicit redirect handling; credentials never leave the original application origin. */
export async function fetchUpdateFeed(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  manifest: ReleaseManifest, feedUrl: string, accessToken: string, signal: AbortSignal
): Promise<Response> {
  let url = new URL('latest.yml', feedUrl).href;
  for (let redirects = 0; redirects <= 4; redirects++) {
    signal.throwIfAborted();
    if (!allowedUpdateUrl(url, manifest, feedUrl)) throw new Error('UPDATE_FEED_URL_BLOCKED');
    const response = await fetcher(url, {
      headers: updateHeaders(manifest, feedUrl, accessToken), credentials: 'omit', redirect: 'manual',
      cache: 'no-store', signal
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    // Authenticated server redirects are never accepted, even to GitHub.
    if (!isGithubFeed(manifest, feedUrl) || !location || redirects === 4) throw new Error('UPDATE_FEED_URL_BLOCKED');
    url = new URL(location, url).href;
  }
  throw new Error('UPDATE_FEED_URL_BLOCKED');
}

export function canFallbackToServer(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /(?:UPDATE_HTTP_|HTTP_ERROR_)(404|408|429|5\d\d)\b|^(?:HttpError:\s*)?(404|408|429|5\d\d)\s|ERR_(CONNECTION|NETWORK|NAME_NOT_RESOLVED|TIMED_OUT|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE)|fetch failed|network|aborted|timeout/i.test(message)
    && !/HASH|SIGNATURE|MANIFEST|BLOCKED/i.test(message);
}
