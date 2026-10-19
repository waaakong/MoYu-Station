import {describe,it,expect,vi} from 'vitest';
import {loadProviderArtwork} from '../src/audio/artworkLoader';
describe('artwork metadata lookup',()=>{
 it('shares one lookup across stages but isolates identity generations',async()=>{
  const lookup=vi.fn(async()=> 'studyroom-media://provider-artwork/'+'a'.repeat(64));vi.stubGlobal('window',{studyRoomDesktop:{getProviderArtwork:lookup}});
  const request={providerId:'netease' as const,trackId:'1'};
  await Promise.all([loadProviderArtwork(request,1),loadProviderArtwork(request,1)]);expect(lookup).toHaveBeenCalledTimes(1);
  await loadProviderArtwork(request,2);expect(lookup).toHaveBeenCalledTimes(2);vi.unstubAllGlobals();
 });
 it('releases failed requests so an explicit later retry can recover',async()=>{
  const lookup=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);vi.stubGlobal('window',{studyRoomDesktop:{getProviderArtwork:lookup}});
  const request={providerId:'qq' as const,trackId:'track'};
  await expect(loadProviderArtwork(request,3)).rejects.toThrow('offline');await expect(loadProviderArtwork(request,3)).resolves.toBeUndefined();vi.unstubAllGlobals();
 });
});
