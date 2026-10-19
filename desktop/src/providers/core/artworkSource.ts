import type { ProviderId } from '@studyroom/contracts';

/** Adapter-only metadata, never a generic renderer URL fetch capability. */
export function artworkSource(providerId: ProviderId, raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 2048) return;
  try {
    const url = new URL(raw.replace('{size}', '480'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.hash) return;
    const allowed = providerId === 'netease' ? /^p\d+\.music\.126\.net$/.test(url.hostname)
      : providerId === 'qq' ? ['y.gtimg.cn', 'y.qq.com', 'qpic.y.qq.com'].includes(url.hostname)
      : ['imge.kugou.com', 'imgessl.kugou.com'].includes(url.hostname);
    const qqPlaylist=providerId==='qq'&&url.hostname==='qpic.y.qq.com'&&/^\/music_cover\/[A-Za-z0-9_!\-]+\/\d{1,4}$/.test(url.pathname);
    if (!allowed || !qqPlaylist&&!/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return;
    if (providerId === 'qq' && !qqPlaylist&&!/^\/(?:music\/photo_new\/|music\/common\/upload\/)/.test(url.pathname)) return;
    if (url.search && !/^\?(?:param=\d+y\d+|max_age=\d+|n=\d+)$/.test(url.search)) return;
    url.protocol = 'https:';
    if (providerId === 'netease') url.search = '?param=480y480';
    return url.href;
  } catch { return; }
}

export function qqAlbumArtwork(mid: unknown): string | undefined {
  return typeof mid === 'string' && /^[A-Za-z0-9]{14}$/.test(mid)
    ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg` : undefined;
}
