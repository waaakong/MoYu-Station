import { privateScenePeriods, type PrivateScenePicture, type PrivateSceneSnapshot } from './scenes';

export const SCENE_CACHE_LIMIT = 96 * 1024 * 1024;
export const SCENE_DISPLAY_LIMIT = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type SceneCacheImage = { assetId: string; mime: string; bytes: Uint8Array };
export type SceneCacheRecord = { snapshot: PrivateSceneSnapshot; images: SceneCacheImage[] };
export type SceneCacheRequest = { action: 'read' | 'refresh' | 'clear'; owner: string };

export function validScenePicture(value: any): value is PrivateScenePicture {
  return !!value && uuid.test(value.assetId) && ['cover', 'contain'].includes(value.fit)
    && [['focalX', 0, 1], ['focalY', 0, 1], ['zoom', 1, 3], ['dim', 0, .8]].every(([key, min, max]) =>
      typeof value[key as string] === 'number' && Number.isFinite(value[key as string])
      && value[key as string] >= Number(min) && value[key as string] <= Number(max));
}

export function parseSceneSnapshot(value: any): PrivateSceneSnapshot {
  if (!value || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.deleted !== 'boolean'
    || !Array.isArray(value.media) || value.media.length > 8) throw new Error('场景响应无效');
  if (value.deleted) {
    if (value.config !== null || value.media.length) throw new Error('场景墓碑无效');
    return { version: value.version, deleted: true, config: null, media: [] };
  }
  const config = value.config;
  if (!config || typeof config.name !== 'string' || !config.name.trim() || [...config.name].length > 40
    || !validScenePicture(config.defaultImage) || !config.periods || typeof config.periods !== 'object' || Array.isArray(config.periods)
    || Object.entries(config.periods).some(([key, picture]) => !privateScenePeriods.includes(key as any) || !validScenePicture(picture))) throw new Error('场景配置无效');
  const ids = new Set<string>(); let bytes = 0;
  const media = value.media.map((item: any) => {
    if (!item) throw new Error('场景媒体无效');
    const base = `/api/media/assets/${item.assetId}`;
    if (!uuid.test(item.assetId) || ids.has(item.assetId) || item.clearUrl !== `${base}/clear` || item.displayUrl !== `${base}/display`
      || item.thumbUrl !== `${base}/thumb` || !Number.isInteger(item.width) || !Number.isInteger(item.height) || item.width < 1 || item.height < 1
      || item.width > 4096 || item.height > 4096 || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('场景媒体无效');
    ids.add(item.assetId); bytes += item.bytes;
    return { assetId: item.assetId, width: item.width, height: item.height, clearUrl: item.clearUrl, displayUrl: item.displayUrl, thumbUrl: item.thumbUrl, bytes: item.bytes };
  });
  if (bytes > SCENE_CACHE_LIMIT || [config.defaultImage, ...Object.values(config.periods)].some((picture: any) => !ids.has(picture.assetId))) throw new Error('场景媒体缺失或超预算');
  const picture = (p: PrivateScenePicture): PrivateScenePicture => ({ assetId: p.assetId, fit: p.fit, focalX: p.focalX, focalY: p.focalY, zoom: p.zoom, dim: p.dim });
  return { version: value.version, deleted: false, config: { name: config.name, defaultImage: picture(config.defaultImage),
    periods: Object.fromEntries(Object.entries(config.periods).map(([key, p]) => [key, picture(p as PrivateScenePicture)])) }, media };
}

export function parseSceneCacheRequest(value: any): SceneCacheRequest {
  if (!value || Object.keys(value).some(key => !['action', 'owner'].includes(key))
    || !['read', 'refresh', 'clear'].includes(value.action) || !/^[1-9][0-9]{0,18}$/.test(value.owner) || typeof value.owner !== 'string') throw new Error('SCENE_CACHE_REQUEST_INVALID');
  return { action: value.action, owner: value.owner };
}

export function parseSceneCacheRecord(value: any): SceneCacheRecord {
  const snapshot = parseSceneSnapshot(value?.snapshot);
  if (!Array.isArray(value.images) || value.images.length !== snapshot.media.length) throw new Error('SCENE_CACHE_IMAGES_INVALID');
  const seen = new Set<string>(); let total = 0;
  const images = value.images.map((image: any) => {
    if (!image || !snapshot.media.some(item => item.assetId === image.assetId) || seen.has(image.assetId)
      || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) || !(image.bytes instanceof Uint8Array)
      || image.bytes.byteLength < 1 || image.bytes.byteLength > SCENE_DISPLAY_LIMIT) throw new Error('SCENE_CACHE_IMAGE_INVALID');
    seen.add(image.assetId); total += image.bytes.byteLength;
    return { assetId: image.assetId, mime: image.mime, bytes: image.bytes };
  });
  if (total > SCENE_CACHE_LIMIT) throw new Error('SCENE_CACHE_QUOTA');
  return { snapshot, images };
}
