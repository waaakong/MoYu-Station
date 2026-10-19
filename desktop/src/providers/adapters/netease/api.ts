import { z } from "zod";
import type { ProviderTrackRef, Track, ProviderPlaylistPage, ProviderSearchPage, TrackLyrics } from "@studyroom/contracts";
import { ProviderError } from "../../core/providerErrors";
import { neteaseTrackBadges } from "../../core/trackBadges";
import { normalizeProviderTrack } from "../../core/trackNormalizer";
import { requestNetease, type NeteaseTransport, type NeteaseSession } from "./transport";

const id = z.union([z.string().regex(/^[1-9]\d{0,19}$/),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
export const neteaseSessionSchema = z.object({
  MUSIC_U:z.string().regex(/^[\x21-\x7E]{1,8192}$/).refine(value=>!/[;,]/.test(value)),
  __csrf:z.string().regex(/^[a-zA-Z0-9_-]{0,128}$/).optional()
}).strict();
const paging = z.object({cursor:z.string().regex(/^(0|[1-9]\d{0,5})$/).optional(),pageSize:z.number().int().min(1).max(50).default(30)});
const song = z.object({
  id,name:z.string().min(1).max(512),ar:z.array(z.object({name:z.string().min(1).max(256)})).min(1).max(20),
  al:z.object({name:z.string().max(512),picUrl:z.string().max(2048).optional().catch(undefined)}).optional(),dt:z.number().int().nonnegative().optional(),
  fee:z.number().int().optional(),privilege:z.object({pl:z.number().optional(),st:z.number().optional()}).nullish()
});
type Song = z.infer<typeof song>;
function parse<T>(schema:z.ZodType<T>,value:unknown):T {
  const result=schema.safeParse(value);if(!result.success)throw new ProviderError("PROVIDER_API_CHANGED");return result.data;
}
function ref(value:Song):ProviderTrackRef {
  const available=(value.privilege?.pl??0)>0 && (value.privilege?.st??0)>=0;
  return normalizeProviderTrack({providerId:"netease",trackId:value.id,title:value.name,artists:value.ar.map(a=>a.name),album:value.al?.name,artworkUrl:value.al?.picUrl,durationMs:value.dt,quality:"unknown",available,badges:neteaseTrackBadges(value.fee,value.privilege?.st),
    rights:available?"available":value.fee===1?"subscription-required":value.fee===4?"purchase-required":"unavailable"});
}
function track(value:ProviderTrackRef):Track {
  return{id:value.id,title:value.title,artist:value.artists.join(" / "),album:value.album,durationMs:value.durationMs,source:{kind:"provider",providerId:"netease",trackId:value.trackId},providerCandidates:[value],selectedProviderId:"netease"};
}
export const NETEASE_CAPABILITIES = ["search","playlists","favorites","lyrics","playback"] as const;
export const neteaseAccountSchema=z.object({accountId:id,displayName:z.string().min(1).max(256)}).strict();
export type NeteaseAccount=z.infer<typeof neteaseAccountSchema>;
export interface NeteasePlayback { providerId:"netease";trackId:string;url:string;expiresAt:number;allowedHosts:string[] }

export class NeteaseApi {
  constructor(private readonly transport:NeteaseTransport=requestNetease,private readonly now=Date.now){}

  private async call(route:Parameters<NeteaseTransport>[0],data:Record<string,unknown>,session:NeteaseSession|undefined,signal:AbortSignal):Promise<unknown>{
    const value=await this.transport(route,data,session,signal);signal.throwIfAborted();
    const status=parse(z.object({code:z.number().int()}),value);
    if(status.code===301||status.code===302)throw new ProviderError(session?"PROVIDER_SESSION_EXPIRED":"PROVIDER_LOGIN_REQUIRED");
    if(status.code===429||status.code===-460)throw new ProviderError("PROVIDER_RATE_LIMITED","PROVIDER_RATE_LIMITED",true);
    if(status.code!==200)throw new ProviderError("PROVIDER_UNAVAILABLE","PROVIDER_UNAVAILABLE",true);
    return value;
  }
  async account(session:NeteaseSession|undefined,signal:AbortSignal):Promise<NeteaseAccount|undefined>{
    const value=parse(z.object({account:z.object({id}).nullable(),profile:z.object({userId:id,nickname:z.string().min(1).max(256)}).nullable()}),await this.call("account",{},session,signal));
    if(!value.account||!value.profile){if(session)throw new ProviderError("PROVIDER_SESSION_EXPIRED");return undefined;}
    if(value.account.id!==value.profile.userId)throw new ProviderError("PROVIDER_API_CHANGED");
    return{accountId:value.account.id,displayName:value.profile.nickname};
  }
  async search(input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<ProviderTrackRef[]>{
    const query=parse(paging.extend({query:z.string().trim().min(1).max(120)}).strict(),input);
    const data=parse(z.object({result:z.object({songCount:z.number().int().nonnegative(),songs:z.array(song).max(50).optional()})}),await this.call("search",{s:query.query,type:1,limit:query.pageSize,offset:Number(query.cursor??0),total:true},session,signal));
    if(data.result.songCount>0&&!data.result.songs)throw new ProviderError("PROVIDER_API_CHANGED");
    return(data.result.songs??[]).map(ref);
  }
  private async signedIn(session:NeteaseSession|undefined,signal:AbortSignal):Promise<NeteaseAccount>{
    if(!session)throw new ProviderError("PROVIDER_LOGIN_REQUIRED");
    const account=await this.account(session,signal);if(!account)throw new ProviderError("PROVIDER_SESSION_EXPIRED");return account;
  }
  async playlists(input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<ProviderPlaylistPage>{
    const page=parse(paging.strict(),input),account=await this.signedIn(session,signal),offset=Number(page.cursor??0);
    const value=parse(z.object({more:z.boolean(),playlist:z.array(z.object({id,name:z.string().min(1).max(512),coverImgUrl:z.string().max(2048).optional().catch(undefined),trackCount:z.number().int().nonnegative()})).max(50)}),await this.call("playlists",{uid:account.accountId,limit:page.pageSize,offset,includeVideo:false},session,signal));
    if(value.more&&!value.playlist.length)throw new ProviderError("PROVIDER_API_CHANGED");
    return{providerId:"netease",items:value.playlist.map(p=>({providerId:"netease",id:p.id,name:p.name,trackCount:p.trackCount,artworkToken:p.coverImgUrl})),fromCache:false,nextCursor:value.more?String(offset+value.playlist.length):undefined};
  }
  private async details(ids:string[],session:NeteaseSession|undefined,signal:AbortSignal):Promise<Track[]>{
    if(!ids.length)return[];
    const value=parse(z.object({songs:z.array(song).max(50),privileges:z.array(z.object({id,pl:z.number(),st:z.number()})).max(50)}),await this.call("details",{c:JSON.stringify(ids.map(id=>({id})))},session,signal));
    const byId=new Map(value.songs.map(s=>[s.id,s])),privileges=new Map(value.privileges.map(p=>[p.id,p]));
    // Missing/removed tracks are omitted; platform IDs, not response order, define the page.
    return ids.flatMap(id=>{const s=byId.get(id);return s?[track(ref({...s,privilege:privileges.get(id)}))]:[];});
  }
  async collection(operation:"playlistTracks"|"favorites",input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<ProviderSearchPage>{
    const page=parse(paging.extend({playlistId:id.optional()}).strict(),input),account=await this.signedIn(session,signal);
    let ids:string[];
    if(operation==="favorites"){
      ids=parse(z.object({ids:z.array(id).max(10000)}),await this.call("favorites",{uid:account.accountId},session,signal)).ids;
    }else{
      if(!page.playlistId)throw new ProviderError("PROVIDER_UNAVAILABLE");
      ids=parse(z.object({playlist:z.object({trackIds:z.array(z.object({id})).max(10000)})}),await this.call("playlist",{id:page.playlistId,n:0,s:0},session,signal)).playlist.trackIds.map(t=>t.id);
    }
    const offset=Number(page.cursor??0),selected=ids.slice(offset,offset+page.pageSize);
    return{providerId:"netease",items:await this.details(selected,session,signal),fromCache:false,nextCursor:offset+selected.length<ids.length?String(offset+selected.length):undefined};
  }
  async trackDetails(input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<ProviderTrackRef|undefined>{
    const {trackId}=parse(z.object({trackId:id}).strict(),input);
    const tracks=await this.details([trackId],session,signal);
    return tracks[0]?.providerCandidates?.[0];
  }
  async lyrics(input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<TrackLyrics|undefined>{
    const {trackId}=parse(z.object({trackId:id}).strict(),input);
    const value=parse(z.object({lrc:z.object({lyric:z.string().max(200000)}).optional()}),await this.call("lyrics",{id:trackId,lv:-1,tv:-1,rv:-1},session,signal));
    return value.lrc?.lyric?{trackId:`netease:${trackId}`,content:value.lrc.lyric,source:"provider",providerId:"netease"}:undefined;
  }
  async playback(input:unknown,session:NeteaseSession|undefined,signal:AbortSignal):Promise<NeteasePlayback>{
    const {trackId}=parse(z.object({trackId:id,playbackSessionId:z.string().min(1).max(128),accountScope:z.string().min(1).max(128)}).strict(),input);
    const value=parse(z.object({data:z.array(z.object({id,url:z.string().max(4096).nullable(),code:z.number(),expi:z.number().positive().max(86400),freeTrialInfo:z.unknown().optional()})).max(1)}),await this.call("playback",{ids:JSON.stringify([trackId]),level:"standard",encodeType:"mp3"},session,signal));
    const source=value.data[0];
    if(!source||source.id!==trackId)throw new ProviderError("PROVIDER_API_CHANGED");
    if(source.code!==200||!source.url||source.freeTrialInfo!=null)throw new ProviderError("PROVIDER_RIGHTS_RESTRICTED");
    let url:URL;try{url=new URL(source.url);}catch{throw new ProviderError("PROVIDER_API_CHANGED");}
    if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.port||!url.hostname.endsWith(".music.126.net"))throw new ProviderError("PROVIDER_UNAVAILABLE");
    // Platform may return an HTTP CDN URL; only the same host/path over verified TLS is used.
    url.protocol="https:";
    return{providerId:"netease",trackId,url:url.href,expiresAt:this.now()+Math.min(source.expi,300)*1000,allowedHosts:[url.hostname]};
  }
  async execute(operation:string,payload:unknown,signal:AbortSignal):Promise<unknown>{
    const envelope=parse(z.object({input:z.unknown(),session:neteaseSessionSchema.optional()}).strict(),payload);
    switch(operation){
      case "account":return this.account(envelope.session,signal);
      case "search":return this.search(envelope.input,envelope.session,signal);
      case "trackDetails":return this.trackDetails(envelope.input,envelope.session,signal);
      case "playlists":return this.playlists(envelope.input,envelope.session,signal);
      case "favorites":case "playlistTracks":return this.collection(operation,envelope.input,envelope.session,signal);
      case "lyrics":return this.lyrics(envelope.input,envelope.session,signal);
      case "resolvePlayback":return this.playback(envelope.input,envelope.session,signal);
      default:throw new ProviderError("PROVIDER_DISABLED");
    }
  }
}
