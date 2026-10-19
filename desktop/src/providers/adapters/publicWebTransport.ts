import { lookup } from "node:dns";
import { request } from "node:https";
import { isPublicAddress } from "../radio/ssrfGuard";
import { ProviderError } from "../core/providerErrors";
import { retryAfterMs } from '../core/retryAfter';
import { qqSessionSchema, qqToken, type QQSession } from './qq/session';

const ROUTES = {
  qqSuggest: ["c.y.qq.com", "/splcloud/fcgi-bin/smartbox_new.fcg", "https://y.qq.com/"],
  qqRpc: ["u.y.qq.com", "/cgi-bin/musicu.fcg", "https://y.qq.com/"],
  qqAccount: ["c.y.qq.com", "/rsc/fcgi-bin/fcg_get_profile_homepage.fcg", "https://y.qq.com/"],
  qqPlaylists: ["c.y.qq.com", "/rsc/fcgi-bin/fcg_user_created_diss", "https://y.qq.com/"],
  kugouSearch: ["complexsearch.kugou.com", "/v2/search/song", "https://www.kugou.com/"],
  kugouSong: ["wwwapi.kugou.com", "/play/songinfo", "https://www.kugou.com/"],
  kugouPlaylists: ["gateway.kugou.com", "/v7/get_all_list", "https://www.kugou.com/"],
  kugouCollection: ["gateway.kugou.com", "/v4/get_list_all_file_v3", "https://www.kugou.com/"]
} as const;
export type PublicWebRoute = keyof typeof ROUTES;
export type PublicWebTransport = (route:PublicWebRoute, params:Record<string,string>, data:unknown|undefined, signal:AbortSignal)=>Promise<unknown>;

/** No caller-controlled host, redirect, proxy, Cookie or authorization header. */
export const requestPublicWeb:PublicWebTransport = (route,params,data,signal)=>perform(route,params,data,signal);
export type QQWebRoute='qqSuggest'|'qqRpc'|'qqAccount'|'qqPlaylists';
export type QQWebTransport=(route:QQWebRoute,params:Record<string,string>,data:unknown|undefined,session:QQSession|undefined,signal:AbortSignal)=>Promise<unknown>;
export const requestQQWeb:QQWebTransport=(route,params,data,session,signal)=>{
  if(!['qqSuggest','qqRpc','qqAccount','qqPlaylists'].includes(route))throw new ProviderError('PROVIDER_UNAVAILABLE');
  if(!session)return perform(route,params,data,signal);
  const parsed=qqSessionSchema.safeParse(session);if(!parsed.success)throw new ProviderError('PROVIDER_SESSION_EXPIRED');
  const s=parsed.data;
  return perform(route,{...params,g_tk:qqToken(s.skey??s.qqmusic_key),g_tk_new_20200303:qqToken(s.qqmusic_key)},data,signal,Object.entries(s).map(([key,value])=>`${key}=${value}`).join('; '));
};
async function perform(route:PublicWebRoute,params:Record<string,string>,data:unknown|undefined,signal:AbortSignal,cookie?:string):Promise<unknown>{
  signal.throwIfAborted();
  if (!Object.hasOwn(ROUTES,route)) throw new ProviderError("PROVIDER_UNAVAILABLE");
  const [hostname,pathname,referer]=ROUTES[route];
  const query=new URLSearchParams(params).toString(),body=data===undefined?undefined:JSON.stringify(data);
  if(Buffer.byteLength(query)+Buffer.byteLength(body??"")>64*1024)throw new ProviderError("PROVIDER_UNAVAILABLE");
  return new Promise((resolve,reject)=>{
    const req=request({hostname,port:443,path:pathname+(query?`?${query}`:""),method:body?"POST":"GET",signal,
      headers:{Referer:referer,"User-Agent":"StudyRoom-Desktop-Experimental/0.2",...(['kugouPlaylists','kugouCollection'].includes(route)?{'x-router':'cloudlist.service.kugou.com'}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{"Content-Type":"application/json","Content-Length":String(Buffer.byteLength(body))}:{})},
      lookup:(name,options,callback)=>lookup(name,{...options,all:true},(error,addresses)=>{
        if(error||!addresses.length||addresses.some(a=>!isPublicAddress(a.address))){callback(new Error("PROVIDER_NETWORK_REJECTED"),[]);return;}
        if(options.all)callback(null,addresses);else callback(null,addresses[0]!.address,addresses[0]!.family);
      })
    },response=>{
      if(response.statusCode!==200){response.destroy();const code=response.statusCode===429?'PROVIDER_RATE_LIMITED':'PROVIDER_UNAVAILABLE';reject(new ProviderError(code,code,true,response.statusCode===429?retryAfterMs(response.headers['retry-after']):undefined));return;}
      if(response.headers["ssa-code"]){response.destroy();reject(new ProviderError("PROVIDER_LOGIN_REQUIRED"));return;}
      let size=0;const chunks:Buffer[]=[];
      response.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024){response.destroy();reject(new ProviderError("PROVIDER_API_CHANGED"));return;}chunks.push(chunk);});
      response.on("error",()=>reject(new ProviderError("PROVIDER_UNAVAILABLE")));
      response.on("end",()=>{try{signal.throwIfAborted();resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(signal.aborted?new DOMException("Aborted","AbortError"):new ProviderError("PROVIDER_API_CHANGED"));}});
    });
    const timer=setTimeout(()=>req.destroy(new ProviderError("PROVIDER_TIMEOUT")),8000);
    req.once("close",()=>clearTimeout(timer));req.on("error",error=>reject(signal.aborted?new DOMException("Aborted","AbortError"):error instanceof ProviderError?error:new ProviderError("PROVIDER_UNAVAILABLE")));
    req.end(body);
  });
};
