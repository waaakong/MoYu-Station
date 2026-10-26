import { lookup } from "node:dns";
import { request } from "node:https";
import { Readable } from "node:stream";
import { isPublicAddress } from "../../providers/radio/ssrfGuard";

/** Streaming HTTPS with the public-address check on the socket's actual DNS lookup. */
export const pinnedMediaFetch: typeof fetch = async (input,init) => {
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.protocol!=="https:"||url.username||url.password||url.port)throw new Error("MEDIA_URL_REJECTED");
  if(init?.method&&init.method!=="GET")throw new Error("MEDIA_METHOD_REJECTED");
  const signal=init?.signal??undefined;signal?.throwIfAborted();
  const headers=Object.fromEntries(new Headers(init?.headers).entries());
  return new Promise<Response>((resolve,reject)=>{
    const req=request(url,{method:"GET",headers,signal,
      lookup:(host,options,callback)=>lookup(host,{...options,all:true},(error,addresses)=>{
        if(error||!addresses.length||addresses.some(a=>!isPublicAddress(a.address))){callback(new Error("MEDIA_ADDRESS_REJECTED"),[]);return;}
        if(options.all)callback(null,addresses);else callback(null,addresses[0]!.address,addresses[0]!.family);
      })
    },response=>{
      clearTimeout(deadline);
      // No redirect handling: an upstream redirect is a failure, never a new destination.
      if(![200,206].includes(response.statusCode??0)){response.destroy();reject(new Error("MEDIA_STATUS_REJECTED"));return;}
      const responseHeaders=new Headers();
      for(const name of ["content-type","content-length","content-range","accept-ranges","etag"]){
        const value=response.headers[name];if(typeof value==="string")responseHeaders.set(name,value);
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>,{status:response.statusCode,headers:responseHeaders}));
    });
    const deadline=setTimeout(()=>req.destroy(new Error("MEDIA_HEADER_TIMEOUT")),10000);
    req.setTimeout(15000,()=>req.destroy(new Error("MEDIA_IDLE_TIMEOUT")));
    req.once("close",()=>clearTimeout(deadline));req.once("error",reject);req.end();
  });
};
