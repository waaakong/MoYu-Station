import type { MediaDescriptor } from '@studyroom/contracts';

export type GalleryImage = {
  clearUrl: string; thumbnailUrl: string;
  width?: number; height?: number; animated: boolean;
};
const assetPath = /^\/api\/media\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/clear$/;

/** Preserve legacy order and URLs. Metadata may enhance an exact match, never substitute a different asset. */
export function galleryImages(urls: readonly string[] = [], descriptors: readonly MediaDescriptor[] = []): GalleryImage[] {
  return urls.slice(0, 9).map(clearUrl => {
    const id = assetPath.exec(clearUrl)?.[1];
    const descriptor = descriptors.find(item => item?.clearUrl === clearUrl && item.assetId === id);
    if (!id || !descriptor || !Number.isSafeInteger(descriptor.width) || !Number.isSafeInteger(descriptor.height)
        || descriptor.width < 1 || descriptor.height < 1 || descriptor.width > 12000 || descriptor.height > 12000
        || descriptor.thumbnailUrl !== `/api/media/assets/${id}/thumb`) {
      return { clearUrl, thumbnailUrl: clearUrl, animated: false };
    }
    return { clearUrl, thumbnailUrl: descriptor.thumbnailUrl, width: descriptor.width, height: descriptor.height, animated: descriptor.animated === true };
  });
}

export function galleryColumns(count: number) { return count <= 1 ? 1 : count === 2 || count === 4 ? 2 : 3; }
export function isLongImage(width?: number, height?: number) { return !!width && !!height && height / width >= 3; }
