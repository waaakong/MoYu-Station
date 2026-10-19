import type {ProviderLyricsRequest,ProviderPlaylistTracksRequest} from '@studyroom/contracts';
const pending=new Map<string,Promise<string|undefined>>();
/** Player and both stages share one exact-identity metadata lookup. */
export function loadProviderArtwork(request:ProviderLyricsRequest,identityEpoch:number):Promise<string|undefined>{
  const key=JSON.stringify([identityEpoch,request.providerId,request.trackId]);
  const existing=pending.get(key);if(existing)return existing;
  const job=Promise.resolve().then(()=>window.studyRoomDesktop?.getProviderArtwork(request)).finally(()=>pending.delete(key));
  pending.set(key,job);return job;
}

const playlistJobs=new Map<string,{expires:number;job:Promise<string|undefined>}>();
let playlistTail:Promise<unknown>=Promise.resolve();
/** Visible playlists only; serialize optional first-track fallbacks. */
export function loadPlaylistArtwork(request:ProviderPlaylistTracksRequest,identityEpoch:number,isCurrent=()=>true):Promise<string|undefined>{
  const key=JSON.stringify([identityEpoch,request.providerId,request.playlistId]);
  const existing=playlistJobs.get(key);if(existing&&existing.expires>Date.now())return existing.job;
  const job=playlistTail.catch(()=>{}).then(()=>isCurrent()?window.studyRoomDesktop?.getProviderPlaylistArtwork(request):undefined);
  playlistTail=job.catch(()=>{});
  if(playlistJobs.size>=100)playlistJobs.delete(playlistJobs.keys().next().value!);
  playlistJobs.set(key,{expires:Date.now()+60000,job});return job;
}
