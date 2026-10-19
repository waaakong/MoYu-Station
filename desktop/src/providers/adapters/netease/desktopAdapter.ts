import { createHash, randomUUID } from "node:crypto";
import type { ProviderAccountSummary, ProviderPlaylistPage, ProviderSearchPage, ProviderTrackRef, TrackLyrics } from "@studyroom/contracts";
import type { ProviderAdapter, ProviderOperationContext, ProviderPageInput, ProviderPlaybackInput, ProviderSearchInput } from "../../core/providerAdapter";
import type { ProviderWorkerSupervisor } from "../../core/providerWorkerSupervisor";
import type { ProviderWorkerRequest } from "../../core/providerWorkerProtocol";
import type { CredentialVault } from "../../../storage/credentialVault";
import { ProviderError } from "../../core/providerErrors";
import { NETEASE_CAPABILITIES, neteaseAccountSchema, neteaseSessionSchema, type NeteaseAccount, type NeteasePlayback } from "./api";
import type { NeteaseSession } from "./transport";

export class NeteaseDesktopAdapter implements ProviderAdapter {
  readonly providerId="netease" as const;
  readonly capabilities=NETEASE_CAPABILITIES;
  private session?:NeteaseSession;
  private account?:NeteaseAccount;
  private loaded=false;
  private lifetime=new AbortController();
  private generation=randomUUID();
  private state:ProviderAccountSummary["state"]="signed-out";
  constructor(private readonly worker:ProviderWorkerSupervisor,private readonly vault:CredentialVault){}

  private load():void {
    if(this.loaded)return;
    const saved=this.vault.readSession("netease");
    if(saved){
      const parsed=neteaseSessionSchema.safeParse(saved.values);
      if(!parsed.success)throw new Error("CREDENTIAL_VAULT_CORRUPTED");
      if(saved.expiresAt && saved.expiresAt<=Date.now()){this.state="expired";}else{this.session=parsed.data;}
    }
    this.loaded=true;
  }
  cachedAccount():ProviderAccountSummary {
    return{providerId:"netease",state:this.state,displayName:this.account?.displayName,capabilities:[...this.capabilities]};
  }
  private async call<T>(operation:ProviderWorkerRequest["operation"],input:unknown,context:ProviderOperationContext):Promise<T>{
    this.load();if(this.state==='expired')throw new ProviderError('PROVIDER_SESSION_EXPIRED');const signal=AbortSignal.any([context.signal,this.lifetime.signal]),generation=this.generation;
    try {
      const value=await this.worker.request<T>(operation,{input,session:this.session},signal);signal.throwIfAborted();
      if(generation!==this.generation)throw new DOMException("Session changed","AbortError");return value;
    }catch(error){
      if(generation!==this.generation||signal.aborted)throw new DOMException("Session changed","AbortError");
      if(error instanceof ProviderError && error.code==="PROVIDER_SESSION_EXPIRED"){this.state="expired";this.account=undefined;this.session=undefined;}
      throw error;
    }
  }
  async acceptLogin(values:Record<string,string>,signal:AbortSignal):Promise<void>{
    const session=neteaseSessionSchema.parse(values),current=AbortSignal.any([signal,this.lifetime.signal]);
    const value=await this.worker.request("account",{input:{},session},current);
    current.throwIfAborted();const account=neteaseAccountSchema.safeParse(value);
    if(!account.success)throw new ProviderError("PROVIDER_SESSION_EXPIRED");
    // Commit only after server verification and cancellation checks; never persist a draft login.
    this.vault.storeSession("netease",{version:1,values:session,accountScopeHash:createHash("sha256").update(account.data.accountId).digest("hex")});
    this.session=session;this.account=account.data;this.loaded=true;this.state="signed-in";this.generation=randomUUID();
  }
  async accountSummary(context:ProviderOperationContext):Promise<ProviderAccountSummary>{
    this.load();
    if(!this.session)return this.cachedAccount();
    const value=await this.call<unknown>("account",{},context),parsed=neteaseAccountSchema.safeParse(value);
    if(!parsed.success)throw new ProviderError("PROVIDER_SESSION_EXPIRED");
    this.account=parsed.data;this.state="signed-in";return this.cachedAccount();
  }
  search(input:ProviderSearchInput,context:ProviderOperationContext):Promise<ProviderTrackRef[]>{return this.call("search",input,context);}
  trackDetails(trackId:string,context:ProviderOperationContext):Promise<ProviderTrackRef|undefined>{return this.call("trackDetails",{trackId},context);}
  async recommendations(_input:ProviderPageInput,_context:ProviderOperationContext):Promise<ProviderSearchPage>{throw new ProviderError("PROVIDER_DISABLED");}
  playlists(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderPlaylistPage>{return this.call("playlists",input,context);}
  favorites(input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call("favorites",input,context);}
  playlistTracks(playlistId:string,input:ProviderPageInput,context:ProviderOperationContext):Promise<ProviderSearchPage>{return this.call("playlistTracks",{...input,playlistId},context);}
  lyrics(trackId:string,context:ProviderOperationContext):Promise<TrackLyrics|undefined>{return this.call("lyrics",{trackId},context);}
  async resolvePlayback(input:ProviderPlaybackInput,context:ProviderOperationContext){
    this.load();if(this.session&&!this.account)await this.accountSummary(context);
    const accountScope=createHash("sha256").update(`netease:${this.account?.accountId??"public"}:${this.generation}`).digest("hex");
    const value=await this.call<NeteasePlayback>("resolvePlayback",{...input,accountScope},context);
    let url:URL;try{url=new URL(value.url);}catch{throw new ProviderError("PROVIDER_API_CHANGED");}
    if(value.providerId!=="netease"||value.trackId!==input.trackId||url.protocol!=="https:"||url.username||url.password||url.port||!url.hostname.endsWith(".music.126.net")||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw new ProviderError("PROVIDER_API_CHANGED");
    return{providerId:"netease" as const,trackId:input.trackId,url,expiresAt:Math.min(value.expiresAt,Date.now()+300000),allowedHosts:[url.hostname],accountScope};
  }
  async logout():Promise<void>{this.lifetime.abort();this.worker.dispose();this.session=undefined;this.account=undefined;this.state="signed-out";this.loaded=true;}
  async dispose():Promise<void>{this.lifetime.abort();this.worker.dispose();this.session=undefined;this.account=undefined;}
}
