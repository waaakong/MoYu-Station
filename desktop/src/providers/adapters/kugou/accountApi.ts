import {z} from 'zod';
import {ProviderError} from '../../core/providerErrors';
import {KugouPublicApi} from './publicApi';
import {kugouSessionSchema,type KugouSession} from './session';
import {requestKugouAccount,type KugouAccountTransport} from './accountTransport';
import {KugouMusicApi} from './musicApi';
import {KugouLibraryApi} from './libraryApi';
export const kugouAccountSchema=z.object({accountId:z.string().regex(/^[1-9]\d{4,19}$/),displayName:z.literal('酷狗账号')}).strict();
export class KugouAccountApi {
  constructor(private readonly transport:KugouAccountTransport=requestKugouAccount,private readonly publicApi=new KugouPublicApi(),private readonly musicApi=new KugouMusicApi(),private readonly libraryApi=new KugouLibraryApi()){}
  async account(session:KugouSession|undefined,signal:AbortSignal){
    if(!session)throw new ProviderError('PROVIDER_LOGIN_REQUIRED');
    const {body,cookies}=await this.transport(session,signal);signal.throwIfAborted();
    const error=body.match(/^\s*var error_code\s*=\s*(-?\d+)\s*;\s*$/);
    if(error){if(error[1]==='20018')throw new ProviderError('PROVIDER_SESSION_EXPIRED');throw new ProviderError('PROVIDER_UNAVAILABLE');}
    if(body.trim())throw new ProviderError('PROVIDER_API_CHANGED');
    // Blank script alone is NOT a success. Require the server-issued own ID and token.
    const ids=cookies.filter(c=>c.name==='KugooID'),tokens=cookies.filter(c=>c.name==='t');
    if(ids.length!==1||tokens.length!==1||ids[0]!.value!==session.userid||tokens[0]!.value!==session.token)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
    return {accountId:session.userid,displayName:'酷狗账号' as const};
  }
  async execute(operation:string,payload:unknown,signal:AbortSignal){
    const envelope=z.object({input:z.unknown(),session:kugouSessionSchema.optional()}).strict().safeParse(payload);
    if(!envelope.success)throw new ProviderError('PROVIDER_API_CHANGED');
    if(operation==='account')return this.account(envelope.data.session,signal);
    if(operation==='search')return this.publicApi.execute(operation,envelope.data.input,signal);
    if(operation==='playlists'||operation==='favorites'||operation==='playlistTracks'){
      await this.account(envelope.data.session,signal);
      return operation==='playlists'?this.libraryApi.playlists(envelope.data.input,envelope.data.session,signal):this.libraryApi.collection(operation,envelope.data.input,envelope.data.session,signal);
    }
    if(['trackDetails','resolvePlayback','lyrics'].includes(operation)){
      await this.account(envelope.data.session,signal);
      if(operation==='trackDetails')return this.musicApi.trackDetails(envelope.data.input,envelope.data.session,signal);
      if(operation==='lyrics')return this.musicApi.lyrics(envelope.data.input,envelope.data.session,signal);
      return this.musicApi.playback(envelope.data.input,envelope.data.session,signal);
    }
    throw new ProviderError('PROVIDER_DISABLED');
  }
}
