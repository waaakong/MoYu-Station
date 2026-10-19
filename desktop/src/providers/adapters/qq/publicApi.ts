import { z } from "zod";
import type { ProviderTrackRef, ProviderSearchPage, TrackLyrics } from "@studyroom/contracts";
import { qqAlbumArtwork } from "../../core/artworkSource";
import { ProviderError } from "../../core/providerErrors";
import { qqTrackBadges } from "../../core/trackBadges";
import { normalizeProviderTrack } from "../../core/trackNormalizer";
import { requestPublicWeb, type PublicWebTransport } from "../publicWebTransport";

const mid=z.string().regex(/^[a-zA-Z0-9]{14}$/);
const song=z.object({mid,name:z.string().min(1).max(512),singer:z.array(z.object({name:z.string().min(1).max(256)})).min(1).max(20),album:z.object({name:z.string().max(512),mid:z.string().optional().catch(undefined)}).optional(),interval:z.number().int().nonnegative(),pay:z.object({pay_play:z.number().int(),pay_month:z.number().int().optional()})});
const MEDIA_HOSTS=["aqqmusic.tc.qq.com","dl.stream.qqmusic.qq.com","isure.stream.qqmusic.qq.com","ws.stream.qqmusic.qq.com"] as const;
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const p=schema.safeParse(value);if(!p.success)throw new ProviderError("PROVIDER_API_CHANGED");return p.data;}

/** Anonymous official web APIs only. Does not claim account/library support. */
export class QQPublicApi {
  constructor(private readonly transport:PublicWebTransport=requestPublicWeb,private readonly now=Date.now){}
  private async rpc(module:string,method:string,param:unknown,signal:AbortSignal):Promise<unknown>{
    const value=await this.transport("qqRpc",{},{comm:{format:"json",ct:24,cv:0,uin:0},req:{module,method,param}},signal);signal.throwIfAborted();
    const envelope=parse(z.object({code:z.number(),req:z.object({code:z.number(),data:z.unknown()}).optional()}),value);
    if([envelope.code,envelope.req?.code].some(code=>code===1000||code===-1000))throw new ProviderError("PROVIDER_SESSION_EXPIRED");
    if(envelope.code!==0||!envelope.req||envelope.req.code!==0)throw new ProviderError("PROVIDER_UNAVAILABLE");
    return envelope.req.data;
  }
  async trackDetails(input:unknown,signal:AbortSignal):Promise<ProviderTrackRef|undefined>{
    const {trackId}=parse(z.object({trackId:mid}).strict(),input);
    const value=parse(z.object({track_info:song}),await this.rpc("music.pf_song_detail_svr","get_song_detail_yqq",{song_mid:trackId},signal));
    if(value.track_info.mid!==trackId)throw new ProviderError("PROVIDER_API_CHANGED");
    const s=value.track_info,available=s.pay.pay_play===0;
    return normalizeProviderTrack({providerId:"qq",trackId,title:s.name,artists:s.singer.map(a=>a.name),album:s.album?.name,artworkUrl:qqAlbumArtwork(s.album?.mid),durationMs:s.interval*1000,available,badges:qqTrackBadges(s.pay),rights:available?"available":"subscription-required"});
  }
  private async searchResults(input:unknown,signal:AbortSignal){
    const query=parse(z.object({query:z.string().trim().min(1).max(120),pageSize:z.number().int().min(1).max(50),cursor:z.string().regex(/^[1-9]\d{0,4}$/).optional()}).strict(),input);
    const page=Number(query.cursor??1),key='music.search.SearchCgiService';
    // The current web search envelope is module-keyed and has no top-level comm.
    // Cookies remain confined to the authenticated transport; never retry as guest.
    const raw=await this.transport('qqRpc',{}, {[key]:{module:key,method:'DoSearchForQQMusicDesktop',param:{search_type:0,query:query.query,page_num:page,num_per_page:query.pageSize}}},signal);
    signal.throwIfAborted();
    const envelope=parse(z.object({code:z.number().int(),[key]:z.object({code:z.number().int(),data:z.unknown().optional()}).optional()}),raw);
    const rpc=envelope[key];
    if([envelope.code,rpc?.code].some(c=>c===1000||c===-1000))throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(envelope.code!==0||!rpc||rpc.code!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    const value=parse(z.object({meta:z.object({is_filter:z.number().int(),sum:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}),body:z.object({song:z.object({list:z.array(song).max(50)})})}),rpc.data);
    if(value.meta.is_filter!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    const list=value.body.song.list;
    if(list.length>query.pageSize||!list.length&&(page-1)*query.pageSize<value.meta.sum)throw new ProviderError('PROVIDER_API_CHANGED');
    const refs=list.map(s=>normalizeProviderTrack({providerId:'qq',trackId:s.mid,title:s.name,artists:s.singer.map(a=>a.name),album:s.album?.name,artworkUrl:qqAlbumArtwork(s.album?.mid),durationMs:s.interval*1000,available:s.pay.pay_play===0,badges:qqTrackBadges(s.pay),rights:s.pay.pay_play===0?'available':'subscription-required'}));
    return{refs,nextCursor:page*query.pageSize<value.meta.sum&&list.length===query.pageSize?String(page+1):undefined};
  }
  async search(input:unknown,signal:AbortSignal):Promise<ProviderTrackRef[]>{return(await this.searchResults(input,signal)).refs;}
  async searchPage(input:unknown,signal:AbortSignal):Promise<ProviderSearchPage>{
    const result=await this.searchResults(input,signal);
    return{providerId:'qq',fromCache:false,nextCursor:result.nextCursor,items:result.refs.map(item=>({id:item.id,title:item.title,artist:item.artists.join(' / '),album:item.album,durationMs:item.durationMs,source:{kind:'provider',providerId:'qq',trackId:item.trackId},providerCandidates:[item],selectedProviderId:'qq'}))};
  }
  async playback(input:unknown,signal:AbortSignal){
    const {trackId}=parse(z.object({trackId:mid,playbackSessionId:z.string().min(1).max(128),accountScope:z.string().min(1).max(128)}).strict(),input);
    const fresh=await this.trackDetails({trackId},signal);
    if(!fresh?.isAvailable||fresh.rights!=="available")throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
    const data=parse(z.object({retcode:z.number(),expiration:z.number().positive(),sip:z.array(z.string().max(512)).min(1).max(10),midurlinfo:z.array(z.object({songmid:mid,result:z.number(),purl:z.string().max(4096),pneed:z.number(),pneedbuy:z.number(),ekey:z.string().max(4096)})).length(1)}),await this.rpc("vkey.GetVkeyServer","CgiGetVkey",{guid:"0",songmid:[trackId],songtype:[0],uin:"0",loginflag:1,platform:"20"},signal));
    const item=data.midurlinfo[0]!;
    if(data.retcode!==0||item.result!==0||item.songmid!==trackId||!item.purl||item.pneed!==0||item.pneedbuy!==0||item.ekey)throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
    let url:URL;try{url=new URL(item.purl,data.sip[0]);}catch{throw new ProviderError("PROVIDER_API_CHANGED");}
    if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.port||!MEDIA_HOSTS.some(host=>host===url.hostname)||!/^\/(?:C400|M500)[A-Za-z0-9]+\.(?:m4a|mp3)$/.test(url.pathname))throw new ProviderError("PROVIDER_UNAVAILABLE");
    url.protocol="https:";
    return{providerId:"qq" as const,trackId,url:url.href,expiresAt:this.now()+Math.min(300,data.expiration)*1000,allowedHosts:[url.hostname]};
  }
  async lyrics(input:unknown,signal:AbortSignal):Promise<TrackLyrics|undefined>{
    const {trackId}=parse(z.object({trackId:mid}).strict(),input);
    const value=parse(z.object({crypt:z.number().int(),qrc:z.number().int(),lyric:z.string().max(280000)}),await this.rpc('music.musichallSong.PlayLyricInfo','GetPlayLyricInfo',{songMID:trackId},signal));
    // Only the official plaintext LRC response is supported, never encrypted QRC.
    if(value.crypt!==0||value.qrc!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    if(!value.lyric)return undefined;
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.lyric))throw new ProviderError('PROVIDER_API_CHANGED');
    const bytes=Buffer.from(value.lyric,'base64');
    if(bytes.length>200000)throw new ProviderError('PROVIDER_API_CHANGED');
    let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ProviderError('PROVIDER_API_CHANGED');}
    content=content.replace(/&#10;/g,'\n');
    signal.throwIfAborted();
    return content.trim()?{trackId:`qq:${trackId}`,content,source:'provider',providerId:'qq'}:undefined;
  }
  async execute(operation:string,input:unknown,signal:AbortSignal){
    if(operation==="search")return this.search(input,signal);
    if(operation==="searchPage")return this.searchPage(input,signal);
    if(operation==="trackDetails")return this.trackDetails(input,signal);
    if(operation==="resolvePlayback")return this.playback(input,signal);
    if(operation==="lyrics")return this.lyrics(input,signal);
    throw new ProviderError("PROVIDER_DISABLED");
  }
}
