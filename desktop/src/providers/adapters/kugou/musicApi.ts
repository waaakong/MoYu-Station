import {z} from 'zod';
import type {TrackLyrics} from '@studyroom/contracts';
import {ProviderError} from '../../core/providerErrors';
import {normalizeProviderTrack} from '../../core/trackNormalizer';
import {requestPublicWeb,type PublicWebTransport} from '../publicWebTransport';
import {signKugouWeb} from './webSignature';
import type {KugouSession} from './session';

export const kugouTrackId=z.string().regex(/^(?:[a-zA-Z0-9]{1,64}|audio:[1-9]\d{0,19})$/);
const numericId=z.union([z.string().regex(/^[1-9]\d{0,19}$/),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ProviderError('PROVIDER_API_CHANGED');return r.data;}
const song=z.object({
  encode_album_audio_id:z.string().regex(/^[a-zA-Z0-9]{1,64}$/),album_audio_id:numericId.optional(),song_name:z.string().min(1).max(512),author_name:z.string().min(1).max(512),album_name:z.string().max(512),img:z.string().max(2048).optional().catch(undefined),
  timelength:z.number().int().positive(),privilege:z.number().int(),privilege2:z.union([z.number().int(),z.string().regex(/^\d+$/)]),
  has_privilege:z.boolean(),is_free_part:z.number().int(),play_url:z.string().max(8192),lyrics:z.string().max(200000)
});
export function kugouMediaUrl(raw:string):URL {
  let url:URL;try{url=new URL(raw);}catch{throw new ProviderError('PROVIDER_API_CHANGED');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname!=='webfs.kugou.com'||!/^\/[a-zA-Z0-9_./%\-]+\.mp3$/.test(url.pathname))throw new ProviderError('PROVIDER_UNAVAILABLE');
  return url;
}
export class KugouMusicApi {
  constructor(private readonly transport:PublicWebTransport=requestPublicWeb,private readonly now=Date.now){}
  private async song(trackId:string,session:KugouSession|undefined,signal:AbortSignal){
    if(!session||!session.mid)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    const params:Record<string,string>={srcappid:'2919',clientver:'20000',clienttime:String(this.now()),mid:session.mid,uuid:session.mid,dfid:session.dfid,appid:'1014',platid:'4',...(trackId.startsWith('audio:')?{album_audio_id:trackId.slice(6)}:{encode_album_audio_id:trackId}),token:session.token,userid:session.userid};
    params.signature=signKugouWeb(params);
    const response=parse(z.object({status:z.number().int(),err_code:z.number().int(),data:z.unknown().optional()}),await this.transport('kugouSong',params,undefined,signal));
    signal.throwIfAborted();
    if(response.err_code===20018)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(response.err_code===20028)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    if(response.status!==1||response.err_code!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    const value=parse(song,response.data);
    if(trackId.startsWith('audio:')?value.album_audio_id!==trackId.slice(6):value.encode_album_audio_id!==trackId)throw new ProviderError('PROVIDER_API_CHANGED');
    return value;
  }
  private allowed(value:z.infer<typeof song>){return value.has_privilege&&value.is_free_part===0&&value.privilege===0&&Number(value.privilege2)===0&&!!value.play_url;}
  async trackDetails(input:unknown,session:KugouSession|undefined,signal:AbortSignal){
    const {trackId}=parse(z.object({trackId:kugouTrackId}).strict(),input),s=await this.song(trackId,session,signal),available=this.allowed(s);
    return normalizeProviderTrack({providerId:'kugou',trackId,title:s.song_name,artists:s.author_name.split('、'),album:s.album_name,artworkUrl:s.img,durationMs:s.timelength,available,badges:[],rights:available?'available':'unavailable'});
  }
  async playback(input:unknown,session:KugouSession|undefined,signal:AbortSignal){
    const {trackId}=parse(z.object({trackId:kugouTrackId,playbackSessionId:z.string().min(1).max(128),accountScope:z.string().min(1).max(128)}).strict(),input);
    const s=await this.song(trackId,session,signal);
    if(!this.allowed(s))throw new ProviderError('PROVIDER_RIGHTS_RESTRICTED');
    const url=kugouMediaUrl(s.play_url);
    return{providerId:'kugou' as const,trackId,url:url.href,expiresAt:this.now()+60000,allowedHosts:[url.hostname]};
  }
  async lyrics(input:unknown,session:KugouSession|undefined,signal:AbortSignal):Promise<TrackLyrics|undefined>{
    const {trackId}=parse(z.object({trackId:kugouTrackId}).strict(),input),s=await this.song(trackId,session,signal);
    return s.lyrics.trim()?{trackId:`kugou:${trackId}`,providerId:'kugou',source:'provider',content:s.lyrics}:undefined;
  }
}
