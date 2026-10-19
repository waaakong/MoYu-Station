import {z} from 'zod';
import type {ProviderPlaylistPage,ProviderSearchPage,Track} from '@studyroom/contracts';
import {ProviderError} from '../../core/providerErrors';
import {kugouTrackBadges} from '../../core/trackBadges';
import {normalizeProviderTrack} from '../../core/trackNormalizer';
import {requestPublicWeb,type PublicWebTransport} from '../publicWebTransport';
import {signKugouWeb} from './webSignature';
import type {KugouSession} from './session';

const id=z.union([z.string().regex(/^[1-9]\d{0,19}$/),z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const pageSchema=z.object({cursor:z.string().regex(/^[1-9]\d{0,4}$/).optional(),pageSize:z.number().int().min(1).max(50)});
const playlistId=z.string().regex(/^[01]:[1-9]\d{0,19}$/);
const list=z.object({listid:id,type:z.union([z.literal(0),z.literal(1)]),name:z.string().min(1).max(512),count:z.number().int().nonnegative(),pic:z.string().max(2048).optional().catch(undefined),img:z.string().max(2048).optional().catch(undefined),imgurl:z.string().max(2048).optional().catch(undefined),sizable_cover:z.string().max(2048).optional().catch(undefined),is_def:z.number().int().optional()});
const lists=z.object({userid:id,list_count:z.number().int().nonnegative(),info:z.array(list).max(50)});
const track=z.object({mixsongid:z.union([id,z.literal(0),z.literal('0')]),hash:z.string().regex(/^[a-fA-F0-9]{32}$/).optional(),name:z.string().min(1).max(512),singerinfo:z.array(z.object({name:z.string().max(256)})).max(30),cover:z.string().max(2048).optional().catch(undefined),albuminfo:z.object({name:z.string().max(512),cover:z.string().max(2048).optional().catch(undefined)}),timelen:z.number().int().nonnegative(),media_privilege:z.number().int().optional(),media_pay_type:z.number().int().optional(),is_publish:z.number().int().optional(),media_type:z.string()});
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ProviderError('PROVIDER_API_CHANGED');return r.data;}
export class KugouLibraryApi {
  constructor(private readonly transport:PublicWebTransport=requestPublicWeb,private readonly now=Date.now){}
  private async call(route:'kugouPlaylists'|'kugouCollection',body:Record<string,unknown>,session:KugouSession|undefined,signal:AbortSignal){
    if(!session?.mid)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    signal.throwIfAborted();
    const params:Record<string,string>={appid:session.appid,srcappid:'2919',clientver:'20000',clienttime:String(this.now()),mid:session.mid,uuid:session.mid,dfid:session.dfid,plat:'1',userid:session.userid,token:session.token};
    const data={...body,userid:session.userid,token:session.token};
    params.signature=signKugouWeb(params,JSON.stringify(data));
    const r=parse(z.object({status:z.number().int(),error_code:z.number().int(),data:z.unknown().optional()}),await this.transport(route,params,data,signal));
    signal.throwIfAborted();
    if(r.error_code===20017||r.error_code===20018)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(r.status!==1||r.error_code!==0)throw new ProviderError('PROVIDER_UNAVAILABLE');
    return r.data;
  }
  private async ownLists(page:number,size:number,session:KugouSession|undefined,signal:AbortSignal){
    const value=parse(lists,await this.call('kugouPlaylists',{total_ver:979,type:2,page,pagesize:size},session,signal));
    if(value.userid!==session?.userid)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(value.info.length>size||(page-1)*size<value.list_count&&!value.info.length)throw new ProviderError('PROVIDER_API_CHANGED');
    if(new Set(value.info.map(p=>`${p.type}:${p.listid}`)).size!==value.info.length)throw new ProviderError('PROVIDER_API_CHANGED');
    return value;
  }
  async playlists(input:unknown,session:KugouSession|undefined,signal:AbortSignal):Promise<ProviderPlaylistPage>{
    const p=parse(pageSchema.strict(),input),page=Number(p.cursor??1),v=await this.ownLists(page,p.pageSize,session,signal);
    return{providerId:'kugou',fromCache:false,items:v.info.map(x=>({providerId:'kugou',id:`${x.type}:${x.listid}`,name:x.name,trackCount:x.count,artworkToken:x.pic||x.img||x.imgurl||x.sizable_cover})),nextCursor:page*p.pageSize<v.list_count?String(page+1):undefined};
  }
  private async ownedList(target:string|undefined,session:KugouSession|undefined,signal:AbortSignal){
    // Never read a caller-selected cloud list without rechecking its membership
    // in this account. Bounded scans fail explicitly rather than inventing empty data.
    for(let page=1;page<=20;page++){
      const v=await this.ownLists(page,50,session,signal),matches=v.info.filter(x=>target?`${x.type}:${x.listid}`===target:x.is_def===2);
      if(matches.length>1)throw new ProviderError('PROVIDER_API_CHANGED');
      if(matches[0])return matches[0];
      if(page*50>=v.list_count)break;
    }
    throw new ProviderError('PROVIDER_UNAVAILABLE');
  }
  async collection(operation:'favorites'|'playlistTracks',input:unknown,session:KugouSession|undefined,signal:AbortSignal):Promise<ProviderSearchPage>{
    const p=parse(pageSchema.extend({playlistId:playlistId.optional()}).strict(),input);
    if(operation==='playlistTracks'&&!p.playlistId)throw new ProviderError('PROVIDER_API_CHANGED');
    const selected=await this.ownedList(operation==='favorites'?undefined:p.playlistId,session,signal),page=Number(p.cursor??1);
    const v=parse(z.object({userid:id,listid:id,count:z.number().int().nonnegative(),page:z.number().int().positive(),pagesize:z.number().int().positive(),info:z.array(track).max(50)}),await this.call('kugouCollection',{listid:selected.listid,type:selected.type,page,pagesize:p.pageSize,area_code:1,allplatform:1,show_cover:1},session,signal));
    if(v.userid!==session?.userid)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    if(v.listid!==selected.listid||v.page!==page||v.pagesize!==p.pageSize||v.info.length>p.pageSize||(page-1)*p.pageSize<v.count&&!v.info.length)throw new ProviderError('PROVIDER_API_CHANGED');
    const items:Track[]=v.info.map(s=>{
      const catalogued=String(s.mixsongid)!=='0';
      if(!catalogued&&!s.hash)throw new ProviderError('PROVIDER_API_CHANGED');
      // Personal uploads may have no catalog identity. Preserve them visibly,
      // but do not resolve by guessed title/hash or mark them playable.
      const trackId=catalogued?`audio:${s.mixsongid}`:`file:${s.hash!.toLowerCase()}`,available=catalogued&&s.media_privilege===0&&s.media_pay_type===0&&s.is_publish===1&&s.media_type==='audio';
      const artists=s.singerinfo.map(a=>a.name.trim()).filter(Boolean);
      const c=normalizeProviderTrack({providerId:'kugou',trackId,title:s.name,artists:artists.length?artists:['未知歌手'],album:s.albuminfo.name,artworkUrl:s.cover??s.albuminfo.cover,durationMs:s.timelen,available,badges:kugouTrackBadges(s.is_publish),rights:available?'available':'unavailable'});
      return{id:c.id,title:c.title,artist:c.artists.join(' / '),album:c.album,durationMs:c.durationMs,source:{kind:'provider',providerId:'kugou',trackId},providerCandidates:[c],selectedProviderId:'kugou'};
    });
    return{providerId:'kugou',fromCache:false,items,nextCursor:page*p.pageSize<v.count?String(page+1):undefined};
  }
}
