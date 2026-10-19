import { createHash, randomUUID } from 'node:crypto';
import type { ProviderAccountSummary, ProviderPlaylistPage, ProviderSearchPage, ProviderTrackRef, TrackLyrics } from '@studyroom/contracts';
import type { CredentialVault } from '../../../storage/credentialVault';
import type { ProviderOperationContext, ProviderPageInput, ProviderPlaybackInput, ProviderSearchInput } from '../../core/providerAdapter';
import type { ProviderWorkerSupervisor } from '../../core/providerWorkerSupervisor';
import type { ProviderWorkerRequest } from '../../core/providerWorkerProtocol';
import { ProviderError } from '../../core/providerErrors';
import { WorkerProviderAdapter } from '../workerProviderAdapter';
import { qqAccountSchema, QQ_CAPABILITIES, type QQAccount } from './accountApi';
import { qqSessionSchema, type QQSession } from './session';

export class QQDesktopAdapter extends WorkerProviderAdapter {
  readonly supportsLogin=true;
  override get capabilities(){return QQ_CAPABILITIES;}
  private session?:QQSession;
  private account?:QQAccount;
  private loaded=false;
  private lifetime=new AbortController();
  private generation=randomUUID();
  private state:ProviderAccountSummary['state']='signed-out';
  constructor(worker:ProviderWorkerSupervisor,private readonly vault:CredentialVault){super('qq',worker);}
  private load(){
    if(this.loaded)return;
    const saved=this.vault.readSession('qq');
    if(saved){const parsed=qqSessionSchema.safeParse(saved.values);if(!parsed.success)throw new Error('CREDENTIAL_VAULT_CORRUPTED');if(saved.expiresAt&&saved.expiresAt<=Date.now())this.state='expired';else this.session=parsed.data;}
    this.loaded=true;
  }
  cachedAccount():ProviderAccountSummary{return{providerId:'qq',state:this.state,displayName:this.account?.displayName,capabilities:[...this.capabilities]};}
  private async call<T>(operation:ProviderWorkerRequest['operation'],input:unknown,context:ProviderOperationContext):Promise<T>{
    this.load();if(this.state==='expired')throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    const signal=AbortSignal.any([context.signal,this.lifetime.signal]),generation=this.generation;
    try{const result=await this.worker.request<T>(operation,{input,session:this.session},signal);signal.throwIfAborted();if(generation!==this.generation)throw new DOMException('Session changed','AbortError');return result;}
    catch(error){if(signal.aborted||generation!==this.generation)throw new DOMException('Session changed','AbortError');if(error instanceof ProviderError&&error.code==='PROVIDER_SESSION_EXPIRED'){this.session=undefined;this.account=undefined;this.state='expired';}throw error;}
  }
  async acceptLogin(values:Record<string,string>,signal:AbortSignal):Promise<void>{
    const session=qqSessionSchema.parse(values),current=AbortSignal.any([signal,this.lifetime.signal]),generation=this.generation;
    const value=await this.worker.request('account',{input:{},session},current);current.throwIfAborted();
    if(generation!==this.generation)throw new DOMException('Session changed','AbortError');
    const account=qqAccountSchema.safeParse(value);if(!account.success||account.data.accountId!==session.qqmusic_uin)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    this.vault.storeSession('qq',{version:1,values:session,accountScopeHash:createHash('sha256').update(account.data.accountId).digest('hex')});
    this.session=session;this.account=account.data;this.loaded=true;this.state='signed-in';this.generation=randomUUID();
  }
  override async accountSummary(context:ProviderOperationContext):Promise<ProviderAccountSummary>{
    this.load();if(!this.session)return this.cachedAccount();
    const parsed=qqAccountSchema.safeParse(await this.call('account',{},context));if(!parsed.success||parsed.data.accountId!==this.session?.qqmusic_uin)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    this.account=parsed.data;this.state='signed-in';return this.cachedAccount();
  }
  override search(input:ProviderSearchInput,context:ProviderOperationContext):Promise<ProviderTrackRef[]>{return this.call('search',input,context);}
  searchPage(input:ProviderSearchInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call('searchPage',input,context);}
  trackDetails(trackId:string,context:ProviderOperationContext):Promise<ProviderTrackRef|undefined>{return this.call('trackDetails',{trackId},context);}
  override playlists(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderPlaylistPage>{return this.call('playlists',input,context);}
  override favorites(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call('favorites',input,context);}
  override lyrics(trackId:string,context:ProviderOperationContext):Promise<TrackLyrics|undefined>{return this.call('lyrics',{trackId},context);}
  override playlistTracks(playlistId:string,input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call('playlistTracks',{...input,playlistId},context);}
  override async resolvePlayback(input:ProviderPlaybackInput,context:ProviderOperationContext){
    this.load();if(this.session&&!this.account)await this.accountSummary(context);
    const accountScope=createHash('sha256').update(`qq:${this.account?.accountId??'public'}:${this.generation}`).digest('hex');
    const value=await this.call<{providerId:string;trackId:string;url:string;expiresAt:number}>('resolvePlayback',{...input,accountScope},context);
    let url:URL;try{url=new URL(value.url);}catch{throw new ProviderError('PROVIDER_API_CHANGED');}
    const hosts=['aqqmusic.tc.qq.com','dl.stream.qqmusic.qq.com','isure.stream.qqmusic.qq.com','ws.stream.qqmusic.qq.com'];
    if(value.providerId!=='qq'||value.trackId!==input.trackId||url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname)||!/^\/(?:C400|M500)[A-Za-z0-9]+\.(?:m4a|mp3)$/.test(url.pathname)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw new ProviderError('PROVIDER_API_CHANGED');
    return{providerId:'qq' as const,trackId:input.trackId,url,expiresAt:Math.min(value.expiresAt,Date.now()+300000),allowedHosts:[url.hostname],accountScope};
  }
  override async logout(){this.lifetime.abort();this.worker.dispose();this.session=undefined;this.account=undefined;this.state='signed-out';this.loaded=true;}
  override async dispose(){this.lifetime.abort();this.worker.dispose();this.session=undefined;this.account=undefined;}
}
