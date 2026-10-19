import { lookup } from "node:dns";
import { request } from "node:https";
import { isPublicAddress } from "../../radio/ssrfGuard";
import { ProviderError } from "../../core/providerErrors";
import { retryAfterMs } from '../../core/retryAfter';
import { encodeEapi, encodeWeapi } from "./weapi";

// Routes documented by the MIT NeteaseCloudMusicApi 4.32.0 modules.
export const NETEASE_ROUTES = {
  account: "/weapi/w/nuser/account/get",
  search: "/weapi/cloudsearch/pc",
  playlists: "/weapi/user/playlist",
  playlist: "/weapi/v6/playlist/detail",
  favorites: "/weapi/song/like/get",
  details: "/weapi/v3/song/detail",
  lyrics: "/weapi/song/lyric",
  playback: "/eapi/song/enhance/player/url/v1"
} as const;
export type NeteaseRoute = keyof typeof NETEASE_ROUTES;
export interface NeteaseSession { MUSIC_U: string; __csrf?: string }
export type NeteaseTransport = (route: NeteaseRoute, data: Record<string, unknown>, session: NeteaseSession | undefined, signal: AbortSignal) => Promise<unknown>;

export function neteaseRequestEnvelope(route: NeteaseRoute, data: Record<string, unknown>, session?: NeteaseSession) {
  if (!Object.hasOwn(NETEASE_ROUTES,route)) throw new ProviderError("PROVIDER_UNAVAILABLE");
  if (session && (!/^[\x21-\x7E]{1,8192}$/.test(session.MUSIC_U) || /[;,]/.test(session.MUSIC_U)
    || (session.__csrf !== undefined && !/^[a-zA-Z0-9_-]{0,128}$/.test(session.__csrf)))) throw new ProviderError("PROVIDER_SESSION_EXPIRED");
  // Playback uses the reference API's native request envelope. Do not retry as
  // anonymous or remove authorization parameters when an authenticated URL fails.
  const playback = route === 'playback';
  const nativeHeader = { ...session, os: 'pc' };
  const body = (playback
    ? encodeEapi('/api/song/enhance/player/url/v1', { ...data, e_r: false, header: nativeHeader })
    : encodeWeapi({...data,csrf_token:session?.__csrf ?? ""})).toString();
  if (Buffer.byteLength(body) > 64*1024) throw new ProviderError("PROVIDER_UNAVAILABLE");
  const headers: Record<string,string> = {
    "Content-Type":"application/x-www-form-urlencoded",
    "Content-Length":String(Buffer.byteLength(body)),
    Referer:"https://music.163.com/",
    "User-Agent":"StudyRoom-Desktop-Experimental/0.2"
  };
  if (playback) {
    headers.Cookie=Object.entries(nativeHeader).map(([key,value])=>`${key}=${encodeURIComponent(value)}`).join('; ');
  } else if (session) {
    headers.Cookie=`MUSIC_U=${session.MUSIC_U}`+(session.__csrf?`; __csrf=${session.__csrf}`:"");
  }
  return {hostname:playback?'interface.music.163.com':'music.163.com',path:NETEASE_ROUTES[route],body,headers};
}

export const requestNetease: NeteaseTransport = async (route, data, session, signal) => {
  signal.throwIfAborted();
  const {hostname,path,body,headers}=neteaseRequestEnvelope(route,data,session);
  return await new Promise((resolve,reject)=>{
    const req=request({hostname,port:443,path,method:"POST",headers,signal,
      // Validate the very lookup used by the socket; no separate check/connect DNS race.
      lookup:(hostname,options,callback)=>lookup(hostname,{...options,all:true},(error,addresses)=>{
        if(error || !addresses.length || addresses.some(value=>!isPublicAddress(value.address))) {
          callback(new Error("PROVIDER_NETWORK_REJECTED"),[]);return;
        }
        if(options.all) callback(null,addresses);
        else callback(null,addresses[0]!.address,addresses[0]!.family);
      })
    },response=>{
      const status=response.statusCode??0;
      if(status!==200){response.destroy();const code=status===429?"PROVIDER_RATE_LIMITED":"PROVIDER_UNAVAILABLE";reject(new ProviderError(code,code,true,status===429?retryAfterMs(response.headers['retry-after']):undefined));return;}
      // Node https does not follow redirects, and never accepts an arbitrary proxy or host.
      const chunks:Buffer[]=[];let size=0;
      response.on("data",(chunk:Buffer)=>{
        size+=chunk.length;
        if(size>2*1024*1024){response.destroy();reject(new ProviderError("PROVIDER_API_CHANGED"));return;}
        chunks.push(chunk);
      });
      response.on("error",()=>reject(new ProviderError("PROVIDER_UNAVAILABLE","PROVIDER_UNAVAILABLE",true)));
      response.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(new ProviderError("PROVIDER_API_CHANGED"));}});
    });
    const timeout=setTimeout(()=>req.destroy(new ProviderError("PROVIDER_TIMEOUT","PROVIDER_TIMEOUT",true)),8000);
    req.once("close",()=>clearTimeout(timeout));
    req.on("error",error=>reject(signal.aborted?new DOMException("Aborted","AbortError"):error instanceof ProviderError?error:new ProviderError("PROVIDER_UNAVAILABLE","PROVIDER_UNAVAILABLE",true)));
    req.end(body);
  });
};
