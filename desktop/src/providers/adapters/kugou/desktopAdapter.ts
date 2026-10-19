import {createHash,randomUUID} from 'node:crypto';
import type {ProviderAccountSummary,ProviderTrackRef,TrackLyrics,ProviderPlaylistPage,ProviderSearchPage} from '@studyroom/contracts';
import type {CredentialVault} from '../../../storage/credentialVault';
import type {ProviderOperationContext,ProviderSearchInput,ProviderPlaybackInput,ProviderPageInput} from '../../core/providerAdapter';
import type {ProviderWorkerRequest} from '../../core/providerWorkerProtocol';
import type {ProviderWorkerSupervisor} from '../../core/providerWorkerSupervisor';
import {ProviderError} from '../../core/providerErrors';
import {WorkerProviderAdapter} from '../workerProviderAdapter';
import {kugouAccountSchema} from './accountApi';
import {kugouSessionSchema,type KugouSession} from './session';
import {kugouMediaUrl} from './musicApi';
export class KugouDesktopAdapter extends WorkerProviderAdapter {
  readonly supportsLogin=true;
  override get capabilities(){return ['search','playback','lyrics','playlists','favorites'] as const;}
  private session?:KugouSession;private loaded=false;private lifetime=new AbortController();private generation=randomUUID();
  private state:ProviderAccountSummary['state']='signed-out';
  constructor(worker:ProviderWorkerSupervisor,private readonly vault:CredentialVault){super('kugou',worker);}
  private load(){if(this.loaded)return;const saved=this.vault.readSession('kugou');if(saved){const parsed=kugouSessionSchema.safeParse(saved.values);if(!parsed.success)throw new Error('CREDENTIAL_VAULT_CORRUPTED');if(saved.expiresAt&&saved.expiresAt<=Date.now())this.state='expired';else this.session=parsed.data;}this.loaded=true;}
  cachedAccount():ProviderAccountSummary{return{providerId:'kugou',state:this.state,displayName:this.state==='signed-in'?'酷狗账号':undefined,capabilities:[...this.capabilities]};}
  async acceptLogin(values:Record<string,string>,signal:AbortSignal){
    const session=kugouSessionSchema.parse(values),generation=this.generation,current=AbortSignal.any([signal,this.lifetime.signal]);
    const account=kugouAccountSchema.safeParse(await this.worker.request('account',{input:{},session},current));current.throwIfAborted();
    if(generation!==this.generation)throw new DOMException('Session changed','AbortError');
    if(!account.success||account.data.accountId!==session.userid)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    this.vault.storeSession('kugou',{version:1,values:session,accountScopeHash:createHash('sha256').update(session.userid).digest('hex')});
    this.session=session;this.loaded=true;this.state='signed-in';this.generation=randomUUID();
  }
  override async accountSummary(context:ProviderOperationContext){
    this.load();if(!this.session)return this.cachedAccount();const generation=this.generation,signal=AbortSignal.any([context.signal,this.lifetime.signal]);
    try{const account=kugouAccountSchema.safeParse(await this.worker.request('account',{input:{},session:this.session},signal));signal.throwIfAborted();if(generation!==this.generation)throw new DOMException('Session changed','AbortError');if(!account.success||account.data.accountId!==this.session?.userid)throw new ProviderError('PROVIDER_SESSION_EXPIRED');this.state='signed-in';return this.cachedAccount();}
    catch(e){if(signal.aborted||generation!==this.generation)throw new DOMException('Session changed','AbortError');if(e instanceof ProviderError&&e.code==='PROVIDER_SESSION_EXPIRED'){this.session=undefined;this.state='expired';}throw e;}
  }
  override search(input:ProviderSearchInput,context:ProviderOperationContext):Promise<ProviderTrackRef[]>{return this.worker.request('search',{input},AbortSignal.any([context.signal,this.lifetime.signal]));}
  private async call<T>(operation:ProviderWorkerRequest['operation'],input:unknown,context:ProviderOperationContext):Promise<T>{
    this.load();if(this.state==='expired')throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    const generation=this.generation,signal=AbortSignal.any([context.signal,this.lifetime.signal]);
    try{const result=await this.worker.request<T>(operation,{input,session:this.session},signal);signal.throwIfAborted();if(generation!==this.generation)throw new DOMException('Session changed','AbortError');return result;}
    catch(e){if(signal.aborted||generation!==this.generation)throw new DOMException('Session changed','AbortError');if(e instanceof ProviderError&&e.code==='PROVIDER_SESSION_EXPIRED'){this.session=undefined;this.state='expired';}throw e;}
  }
  trackDetails(trackId:string,context:ProviderOperationContext):Promise<ProviderTrackRef|undefined>{return this.call('trackDetails',{trackId},context);}
  override playlists(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderPlaylistPage>{return this.call('playlists',input,context);}
  override favorites(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call('favorites',input,context);}
  override playlistTracks(playlistId:string,input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call('playlistTracks',{...input,playlistId},context);}
  override lyrics(trackId:string,context:ProviderOperationContext):Promise<TrackLyrics|undefined>{return this.call('lyrics',{trackId},context);}
  override async resolvePlayback(input:ProviderPlaybackInput,context:ProviderOperationContext){
    this.load();if(!this.session)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    const generation=this.generation,accountScope=createHash('sha256').update(`kugou:${this.session.userid}:${generation}`).digest('hex');
    const value=await this.call<{providerId:string;trackId:string;url:string;expiresAt:number}>('resolvePlayback',{...input,accountScope},context);
    if(value.providerId!=='kugou'||value.trackId!==input.trackId||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw new ProviderError('PROVIDER_API_CHANGED');
    const url=kugouMediaUrl(value.url);
    return{providerId:'kugou' as const,trackId:input.trackId,url,expiresAt:Math.min(value.expiresAt,Date.now()+60000),allowedHosts:[url.hostname],accountScope};
  }
  override async logout(){this.lifetime.abort();this.worker.dispose();this.session=undefined;this.state='signed-out';this.loaded=true;this.generation=randomUUID();}
  override async dispose(){await this.logout();}
}
