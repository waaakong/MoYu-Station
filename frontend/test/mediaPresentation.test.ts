import { describe, it, expect } from 'vitest';
import { galleryColumns, galleryImages, isLongImage } from '../src/media/mediaPresentation';
import type { MediaDescriptor } from '@studyroom/contracts';
const id = 'd931721d-2cba-4789-91ae-755f1c9c4c4c';
const media: MediaDescriptor = { assetId:id,purpose:'social',width:600,height:1800,mime:'image/png',animated:false,
  clearUrl:`/api/media/assets/${id}/clear`,thumbnailUrl:`/api/media/assets/${id}/thumb` };
describe('media presentation', () => {
  it('uses trusted dimensions and thumb while retaining full-size viewer URL', () => {
    expect(galleryImages([media.clearUrl], [media])).toEqual([{clearUrl:media.clearUrl,thumbnailUrl:media.thumbnailUrl,width:600,height:1800,animated:false}]);
    expect(isLongImage(media.width, media.height)).toBe(true);
  });
  it('keeps legacy URLs and order without invented dimensions', () => {
    expect(galleryImages(['/uploads/a.png', media.clearUrl], [media])[0]).toEqual({ clearUrl:'/uploads/a.png',thumbnailUrl:'/uploads/a.png',animated:false });
    expect(galleryImages([media.clearUrl], [{...media, assetId:'foreign'}])[0].width).toBeUndefined();
  });
  it.each([{width:0},{height:NaN},{thumbnailUrl:'https://external.invalid/private'},{width:12001}])('rejects malformed metadata %j', patch => {
    expect(galleryImages([media.clearUrl], [{...media,...patch}])[0].thumbnailUrl).toBe(media.clearUrl);
  });
  it('has exact 1/2/3/4/5-9 arrangements', () => {
    expect(Array.from({length:9},(_,index)=>galleryColumns(index+1))).toEqual([1,2,3,2,3,3,3,3,3]);
    expect(isLongImage(undefined,undefined)).toBe(false); expect(isLongImage(1000,600)).toBe(false);
  });
});
