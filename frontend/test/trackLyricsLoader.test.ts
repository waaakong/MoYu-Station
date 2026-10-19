import {describe, expect, it, vi} from 'vitest';
import type {Track} from '@studyroom/contracts';
import {readTrackLyrics} from '../src/audio/lyrics/trackLyricsLoader';
const bridge = () => ({getTrackLyrics:vi.fn(), getProviderLyrics:vi.fn()});
const track:Track = {id:'aggregate-1', title:'Test', artist:'Test', source:{kind:'provider',providerId:'qq',trackId:'0026XoN00Y92BW'}};
describe('source-aware lyrics loader', () => {
  it.each(['netease','qq','kugou'] as const)('uses exact %s source identity, not aggregate ID', async providerId => {
    const b=bridge(); b.getProviderLyrics.mockResolvedValue({trackId:`${providerId}:remote1`,providerId,source:'provider',content:'[00:01]test'});
    const value=await readTrackLyrics({...track,source:{kind:'provider',providerId,trackId:'remote1'}},b);
    expect(b.getProviderLyrics).toHaveBeenCalledWith({providerId,trackId:'remote1'});
    expect(b.getTrackLyrics).not.toHaveBeenCalled(); expect(value?.trackId).toBe(track.id);
  });
  it('refuses wrong provider/track results and preserves network failure for retry',async()=>{
    const b=bridge();b.getProviderLyrics.mockResolvedValue({trackId:'qq:wrong',providerId:'qq',source:'provider',content:'test'});
    await expect(readTrackLyrics(track,b)).rejects.toThrow('IDENTITY_MISMATCH');
    b.getProviderLyrics.mockRejectedValue(new Error('PROVIDER_TIMEOUT'));
    await expect(readTrackLyrics(track,b)).rejects.toThrow('PROVIDER_TIMEOUT');
    expect(b.getTrackLyrics).not.toHaveBeenCalled();
  });
  it('keeps local lyrics local and skips radio/builtin sources',async()=>{
    const b=bridge();await readTrackLyrics({...track,source:{kind:'local',fileToken:'local-token'}},b);
    expect(b.getTrackLyrics).toHaveBeenCalledWith({trackId:track.id});
    b.getTrackLyrics.mockClear();
    for(const source of [{kind:'radio',stationId:'station'},{kind:'builtin',assetId:'asset'}] as const) expect(await readTrackLyrics({...track,source},b)).toBeUndefined();
    expect(b.getTrackLyrics).not.toHaveBeenCalled();expect(b.getProviderLyrics).not.toHaveBeenCalled();
  });
});
