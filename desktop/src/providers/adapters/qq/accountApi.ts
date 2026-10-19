import { z } from 'zod';
import type { ProviderPlaylistPage, ProviderSearchPage, Track } from '@studyroom/contracts';
import { qqAlbumArtwork } from '../../core/artworkSource';
import { QQPublicApi } from './publicApi';
import { qqSessionSchema, type QQSession } from './session';
import { requestQQWeb, type QQWebTransport } from '../publicWebTransport';
import { ProviderError } from '../../core/providerErrors';
import { qqTrackBadges } from "../../core/trackBadges";
import { normalizeProviderTrack } from '../../core/trackNormalizer';

const id=z.union([z.string().regex(/^[1-9]\d{0,19}$/),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const pageSchema=z.object({cursor:z.string().regex(/^(0|[1-9]\d{0,5})$/).optional(),pageSize:z.number().int().min(1).max(50)});
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ProviderError('PROVIDER_API_CHANGED');return result.data;}
export const qqAccountSchema=z.object({accountId:id,displayName:z.string().min(1).max(256)}).strict();
export type QQAccount=z.infer<typeof qqAccountSchema>;
export const QQ_CAPABILITIES=['search','playlists','favorites','lyrics','playback'] as const;
// Other profile sections (e.g. videos and purchases) use empty/non-playlist IDs.
// Only the favorite section is a playlist; never weaken that section's ID check.
const musicSection=z.union([
  z.object({type:z.literal(1),id}),
  z.object({type:z.number().int().refine(value=>value!==1)})
]);
const profileSchema=z.object({creator:z.object({uin:z.union([z.literal(0),id]),nick:z.string().min(1).max(256),ishost:z.number().int().optional(),encrypt_uin:z.string().regex(/^[A-Za-z0-9_-]{8,256}$/).optional()}),mymusic:z.array(musicSection).max(30).optional()});

export class QQAccountApi {
  constructor(private readonly transport:QQWebTransport=requestQQWeb){}
  private async call(route:'qqAccount'|'qqPlaylists'|'qqRpc',params:Record<string,string>,data:unknown,session:QQSession,signal:AbortSignal):Promise<unknown>{
    const raw=await this.transport(route,params,data,session,signal);signal.throwIfAborted();
    const envelope=parse(z.object({code:z.number().int(),data:z.unknown().optional(),req:z.object({code:z.number().int(),data:z.unknown().optional()}).optional()}),raw);
    const codes=[envelope.code,envelope.req?.code];
    if(codes.some(c=>c===1000||c===-1000))throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(envelope.code!==0||route==='qqRpc'&&envelope.req?.code!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    if(route==='qqRpc'&&envelope.req?.data&&typeof envelope.req.data==='object'&&'code' in envelope.req.data){
      const innerCode=envelope.req.data.code;
      if(innerCode===1000||innerCode===-1000)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
      if(innerCode!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    }
    return route==='qqRpc'?envelope.req?.data:envelope.data;
  }
  private async profile(session:QQSession|undefined,signal:AbortSignal){
    if(!session)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    const value=parse(profileSchema,await this.call('qqAccount',{format:'json',cid:'205360838',ct:'20',userid:'0',reqfrom:'1',reqtype:'0'},undefined,session,signal));
    // This fixed userid=0 route is the authenticated current account, not a
    // caller-selected public profile. QQ now redacts numeric uin to 0. Accept
    // that shape only with the server's own-account flag and opaque identity.
    // Invalid credentials still return code 1000 before parsing this payload.
    const redactedOwn=value.creator.uin===0&&value.creator.ishost===1&&!!value.creator.encrypt_uin;
    if(value.creator.ishost===0||!redactedOwn&&value.creator.uin!==session.qqmusic_uin)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    return value;
  }
  async account(session:QQSession|undefined,signal:AbortSignal):Promise<QQAccount>{
    const value=await this.profile(session,signal);return{accountId:session!.qqmusic_uin,displayName:value.creator.nick};
  }
  async playlists(input:unknown,session:QQSession|undefined,signal:AbortSignal):Promise<ProviderPlaylistPage>{
    const page=parse(pageSchema.strict(),input),offset=Number(page.cursor??0),account=await this.account(session,signal);
    const value=parse(z.object({totoal:z.number().int().nonnegative(),disslist:z.array(z.object({tid:z.union([z.literal(0),id]),dirid:z.number().int(),diss_name:z.string().min(1).max(512),diss_cover:z.string().max(2048).optional().catch(undefined),song_cnt:z.union([z.number().int().nonnegative(),z.string().regex(/^\d+$/)]).transform(Number)})).max(51)}),await this.call('qqPlaylists',{format:'json',hostuin:account.accountId,sin:String(offset),size:String(page.pageSize)},undefined,session!,signal));
    if(offset<value.totoal&&!value.disslist.length)throw new ProviderError('PROVIDER_API_CHANGED');
    // 205/206 are special purchase/upload sections, not normal playlists.
    // Keep the server offset even when omitting those unsupported sections.
    const playlists=value.disslist.filter(p=>p.tid!==0);
    if(value.disslist.some(p=>p.tid===0&&p.dirid!==205&&p.dirid!==206))throw new ProviderError('PROVIDER_API_CHANGED');
    return{providerId:'qq',fromCache:false,items:playlists.map(p=>({providerId:'qq',id:String(p.tid),name:p.diss_name,trackCount:p.song_cnt,artworkToken:p.diss_cover})),nextCursor:offset+value.disslist.length<value.totoal?String(offset+value.disslist.length):undefined};
  }
  async collection(operation:'favorites'|'playlistTracks',input:unknown,session:QQSession|undefined,signal:AbortSignal):Promise<ProviderSearchPage>{
    const page=parse(pageSchema.extend({playlistId:id.optional()}).strict(),input),profile=await this.profile(session,signal),offset=Number(page.cursor??0);
    const favorite=profile.mymusic?.find(item=>item.type===1&&'id' in item);
    const playlistId=operation==='favorites'?(favorite&&'id' in favorite?favorite.id:undefined):page.playlistId;
    // Missing required collection metadata is unknown, not an empty collection.
    if(!playlistId)throw new ProviderError('PROVIDER_API_CHANGED');
    // QQ's RPC requires a JSON number. Never round a client string ID.
    const rpcPlaylistId=Number(playlistId);
    if(!Number.isSafeInteger(rpcPlaylistId)||rpcPlaylistId<=0)throw new ProviderError('PROVIDER_API_CHANGED');
    const value=parse(z.object({total_song_num:z.number().int().nonnegative(),songlist:z.array(z.object({mid:z.string().regex(/^[a-zA-Z0-9]{14}$/),name:z.string().min(1).max(512),singer:z.array(z.object({name:z.string().min(1).max(256)})).min(1).max(20),album:z.object({name:z.string().max(512),mid:z.string().optional().catch(undefined)}).optional(),interval:z.number().int().nonnegative(),pay:z.object({pay_play:z.number().int(),pay_month:z.number().int().optional()})})).max(50)}),await this.call('qqRpc',{}, {comm:{format:'json',ct:24,cv:0,uin:session!.qqmusic_uin},req:{module:'music.srfDissInfo.aiDissInfo',method:'uniform_get_Dissinfo',param:{disstid:rpcPlaylistId,song_begin:offset,song_num:page.pageSize,ctx:1,userinfo:1,orderlist:1}}},session!,signal));
    if(offset<value.total_song_num&&!value.songlist.length)throw new ProviderError('PROVIDER_API_CHANGED');
    const items:Track[]=value.songlist.map(s=>{const candidate=normalizeProviderTrack({providerId:'qq',trackId:s.mid,title:s.name,artists:s.singer.map(a=>a.name),album:s.album?.name,artworkUrl:qqAlbumArtwork(s.album?.mid),durationMs:s.interval*1000,available:s.pay.pay_play===0,badges:qqTrackBadges(s.pay),rights:s.pay.pay_play===0?'available':'subscription-required'});return{id:candidate.id,title:candidate.title,artist:candidate.artists.join(' / '),album:candidate.album,durationMs:candidate.durationMs,source:{kind:'provider',providerId:'qq',trackId:s.mid},providerCandidates:[candidate],selectedProviderId:'qq'};});
    return{providerId:'qq',items,fromCache:false,nextCursor:offset+value.songlist.length<value.total_song_num?String(offset+value.songlist.length):undefined};
  }
  async execute(operation:string,payload:unknown,signal:AbortSignal):Promise<unknown>{
    const {input,session}=parse(z.object({input:z.unknown(),session:qqSessionSchema.optional()}).strict(),payload);
    if(operation==='account')return this.account(session,signal);
    if(operation==='playlists')return this.playlists(input,session,signal);
    if(operation==='favorites'||operation==='playlistTracks')return this.collection(operation,input,session,signal);
    if(session||operation==='search'||operation==='searchPage')await this.account(session,signal);
    const api=new QQPublicApi((route,params,data,currentSignal)=>{
      if(route!=='qqSuggest'&&route!=='qqRpc')throw new ProviderError('PROVIDER_DISABLED');
      // Full search and playback retain the verified account; no anonymous retry.
      if(data&&typeof data==='object'&&'comm' in data){
        const body=data as {comm:Record<string,unknown>;req?:{module:string;param:Record<string,unknown>}};
        body.comm={...body.comm,uin:session?.qqmusic_uin??0};
        if(body.req?.module==='vkey.GetVkeyServer')body.req.param={...body.req.param,uin:session?.qqmusic_uin??'0'};
      }
      return this.transport(route,params,data,session,currentSignal);
    });
    return api.execute(operation,input,signal);
  }
}
