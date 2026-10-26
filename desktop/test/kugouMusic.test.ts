import {describe,it,expect,vi} from 'vitest';
import {KugouMusicApi} from '../src/providers/adapters/kugou/musicApi';
import {selectKugouSession} from '../src/providers/adapters/kugou/session';
import {KugouPublicApi} from '../src/providers/adapters/kugou/publicApi';
import type {PublicWebTransport} from '../src/providers/adapters/publicWebTransport';
const session={userid:'1234567890',token:'a'.repeat(64),appid:'1014',clienttime:'1790830000',dfid:'testOnlyDeviceId123456789',mid:'b'.repeat(32)};
const input={trackId:'exampleId',playbackSessionId:'test',accountScope:'test'};
const signal=()=>new AbortController().signal;
const song=()=>({status:1,err_code:0,data:{encode_album_audio_id:input.trackId,song_name:'Test',author_name:'Test artist',album_name:'Test album',timelength:120000,privilege:0,privilege2:'0',has_privilege:true,is_free_part:0,play_url:'https://webfs.kugou.com/test/audio.mp3?key=synthetic',lyrics:'[00:01.00]Synthetic test'}});
describe('Kugou official web music',()=>{
 it('retains only the actual optional official device ID for backward-compatible sessions',()=>{
 const cookies=[{name:'KuGoo',value:`KugooID=${session.userid}&t=${session.token}&a_id=1014&ct=${session.clienttime}`},{name:'kg_dfid',value:session.dfid}];
 expect(selectKugouSession(cookies)?.mid).toBeUndefined();expect(selectKugouSession([...cookies,{name:'kg_mid',value:session.mid}])).toEqual(session);
 expect(selectKugouSession([...cookies,{name:'kg_mid',value:'invented'}])).toBeUndefined();
 });
 it('requires real login device metadata, never invents a fingerprint',async()=>{const transport=vi.fn();const api=new KugouMusicApi(transport);await expect(api.playback(input,{...session,mid:undefined},signal())).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});expect(transport).not.toHaveBeenCalled();});
 it('uses a signed fixed endpoint and returns short-lived internal audio metadata',async()=>{
 const transport=vi.fn<PublicWebTransport>().mockResolvedValue(song());const api=new KugouMusicApi(transport,()=>1000);
 await expect(api.playback(input,session,signal())).resolves.toMatchObject({providerId:'kugou',trackId:input.trackId,expiresAt:61000,allowedHosts:['webfs.kugou.com']});
 expect(transport.mock.calls[0]?.[0]).toBe('kugouSong');expect(transport.mock.calls[0]?.[1]).toMatchObject({mid:session.mid,uuid:session.mid,token:session.token,encode_album_audio_id:input.trackId});
 });
 it.each([{is_free_part:1},{privilege:8,has_privilege:false},{privilege2:'8',is_free_part:1},{has_privilege:false},{play_url:''}])('rejects partial or unverified rights %j',async(patch)=>{const value=song();Object.assign(value.data,patch);await expect(new KugouMusicApi(async()=>value).playback(input,session,signal())).rejects.toMatchObject({code:'PROVIDER_RIGHTS_RESTRICTED'});});
 it('uses authenticated full-play permission rather than treating catalog payment flags as denial',async()=>{
   const value=song();Object.assign(value.data,{privilege:8,privilege2:'8'});
   await expect(new KugouMusicApi(async()=>value).playback(input,session,signal())).resolves.toMatchObject({providerId:'kugou',trackId:input.trackId});
 });
 it.each(['http://webfs.kugou.com/a.mp3','https://127.0.0.1/a.mp3','https://webfs.kugou.com.evil.test/a.mp3','https://webfs.kugou.com/a.enc','https://user@webfs.kugou.com/a.mp3'])('rejects unsafe media %s',async(url)=>{const value=song();value.data.play_url=url;await expect(new KugouMusicApi(async()=>value).playback(input,session,signal())).rejects.toThrow();});
 it('rejects mismatched song identity, malformed payload and expired sessions',async()=>{
 const value=song();value.data.encode_album_audio_id='other';await expect(new KugouMusicApi(async()=>value).playback(input,session,signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
 await expect(new KugouMusicApi(async()=>({status:0,err_code:20018})).playback(input,session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
 });
 it('returns plaintext lyrics with exact provider identity and cancels late replies',async()=>{
 const api=new KugouMusicApi(async()=>song());await expect(api.lyrics({trackId:input.trackId},session,signal())).resolves.toMatchObject({providerId:'kugou',trackId:`kugou:${input.trackId}`,source:'provider'});
 const abort=new AbortController();await expect(new KugouMusicApi(async()=>{abort.abort();return song();}).playback(input,session,abort.signal)).rejects.toMatchObject({name:'AbortError'});
 });
 it('only advertises explicit free/published search results as eligible',async()=>{
 const rows=[{Privilege:0,PayType:0,Publish:1},{Privilege:8,PayType:3,Publish:1},{}].map((rights,i)=>({EMixSongID:`id${i}`,SongName:'Test',SingerName:'Artist',Duration:120,...rights}));
 const tracks=await new KugouPublicApi(async()=>({status:1,data:{lists:rows}})).execute('search',{query:'Test',pageSize:3},signal());expect(tracks.map(t=>t.isAvailable)).toEqual([true,false,false]);
 });
});
