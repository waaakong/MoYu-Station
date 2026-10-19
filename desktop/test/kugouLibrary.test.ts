import {describe,it,expect,vi} from 'vitest';
import {KugouLibraryApi} from '../src/providers/adapters/kugou/libraryApi';
import {KugouMusicApi} from '../src/providers/adapters/kugou/musicApi';
import {signKugouWeb} from '../src/providers/adapters/kugou/webSignature';
import type {PublicWebTransport} from '../src/providers/adapters/publicWebTransport';
const session={userid:'1234567890',token:'a'.repeat(64),appid:'1014',clienttime:'1790830000',dfid:'testOnlyDeviceId123456789',mid:'b'.repeat(32)};
const signal=()=>new AbortController().signal;
const list=()=>({listid:42,type:0,name:'Synthetic list',count:3,is_def:2});
const lists=()=>({status:1,error_code:0,data:{userid:session.userid,list_count:1,info:[list()]}});
const tracks=()=>({status:1,error_code:0,data:{userid:session.userid,listid:42,count:3,page:1,pagesize:2,info:[{mixsongid:123,name:'Synthetic',singerinfo:[{name:'Test artist'}],albuminfo:{name:'Test'},timelen:120000,media_privilege:0,media_pay_type:0,is_publish:1,media_type:'audio'},{mixsongid:124,name:'Paid',singerinfo:[],albuminfo:{name:''},timelen:60000,media_privilege:10,media_pay_type:3,is_publish:1,media_type:'audio'}]}});
describe('Kugou private library',()=>{
 it('signs the exact POST body on fixed routes, with verified own identity',async()=>{
 const transport=vi.fn<PublicWebTransport>().mockResolvedValue(lists());const api=new KugouLibraryApi(transport,()=>1000);
 const result=await api.playlists({pageSize:2},session,signal());expect(result.items[0]?.id).toBe('0:42');expect(result.nextCursor).toBeUndefined();
 const [route,params,body]=transport.mock.calls[0]!;const {signature,...unsigned}=params;expect(route).toBe('kugouPlaylists');expect(signature).toBe(signKugouWeb(unsigned,JSON.stringify(body)));expect(body).toMatchObject({userid:session.userid,token:session.token,page:1,pagesize:2});expect(JSON.stringify(result)).not.toContain(session.token);
 });
 it('paginates favorites and keeps paid entries non-playable',async()=>{
 const api=new KugouLibraryApi(async(route)=>route==='kugouPlaylists'?lists():tracks());const result=await api.collection('favorites',{pageSize:2},session,signal());expect(result.nextCursor).toBe('2');expect(result.items.map(t=>t.providerCandidates?.[0]?.isAvailable)).toEqual([true,false]);expect(result.items[0]?.source).toMatchObject({trackId:'audio:123'});expect(result.items[0]?.durationMs).toBe(120000);
 });
 it('refuses foreign playlists before reading any tracks',async()=>{
 const transport=vi.fn<PublicWebTransport>().mockResolvedValue(lists());await expect(new KugouLibraryApi(transport).collection('playlistTracks',{playlistId:'0:99',pageSize:2},session,signal())).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});expect(transport).toHaveBeenCalledTimes(1);
 });
 it('keeps uncatalogued uploads visible but unavailable and never defaults missing rights to free',async()=>{
 const value=tracks();Object.assign(value.data.info[0]!,{mixsongid:0,hash:'a'.repeat(32),singerinfo:[{name:''}],is_publish:undefined});
 const result=await new KugouLibraryApi(async(route)=>route==='kugouPlaylists'?lists():value).collection('favorites',{pageSize:2},session,signal());expect(result.items[0]?.source).toMatchObject({trackId:`file:${'a'.repeat(32)}`});expect(result.items[0]?.providerCandidates?.[0]?.isAvailable).toBe(false);
 });
 it.each(['account','list','page','size','empty','malformed'])('rejects mismatched or malformed collection %s',async(kind)=>{
 const value=tracks();if(kind==='account')value.data.userid='9999999999';if(kind==='list')value.data.listid=55;if(kind==='page')value.data.page=2;if(kind==='size')value.data.pagesize=3;if(kind==='empty')value.data.info=[];if(kind==='malformed')value.data.info[0]!.mixsongid=Number.MAX_SAFE_INTEGER+1;
 await expect(new KugouLibraryApi(async(route)=>route==='kugouPlaylists'?lists():value).collection('favorites',{pageSize:2},session,signal())).rejects.toMatchObject({code:kind==='account'?'PROVIDER_SESSION_EXPIRED':'PROVIDER_API_CHANGED'});
 });
 it('does not interpret missing favorites or unknown failures as empty success',async()=>{
 const l=lists();l.data.info[0]!.is_def=1;await expect(new KugouLibraryApi(async()=>l).collection('favorites',{pageSize:2},session,signal())).rejects.toThrow();
 await expect(new KugouLibraryApi(async()=>({status:0,error_code:20017})).playlists({pageSize:2},session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
 });
 it('accepts explicit empty libraries and rejects premature empty pagination',async()=>{
 const l=lists();l.data.info=[];await expect(new KugouLibraryApi(async()=>l).playlists({pageSize:2},session,signal())).rejects.toThrow();l.data.list_count=0;await expect(new KugouLibraryApi(async()=>l).playlists({pageSize:2},session,signal())).resolves.toMatchObject({items:[],nextCursor:undefined});
 });
 it('drops late responses after cancellation',async()=>{
 const c=new AbortController();await expect(new KugouLibraryApi(async()=>{c.abort();return lists();}).playlists({pageSize:2},session,c.signal)).rejects.toMatchObject({name:'AbortError'});
 });
 it('verifies numeric song identity separately from encoded IDs',async()=>{
 const value={status:1,err_code:0,data:{encode_album_audio_id:'encoded',album_audio_id:123,song_name:'Test',author_name:'Test',album_name:'',timelength:120000,privilege:0,privilege2:'0',has_privilege:true,is_free_part:0,play_url:'https://webfs.kugou.com/a.mp3',lyrics:''}};
 const transport=vi.fn<PublicWebTransport>().mockResolvedValue(value);const api=new KugouMusicApi(transport);await expect(api.trackDetails({trackId:'audio:123'},session,signal())).resolves.toMatchObject({trackId:'audio:123',isAvailable:true});expect(transport.mock.calls[0]![1]).toMatchObject({album_audio_id:'123'});value.data.album_audio_id=999;await expect(api.trackDetails({trackId:'audio:123'},session,signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
 });
});
