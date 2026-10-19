import {request} from 'node:https';
import {lookup} from 'node:dns';
import {isPublicAddress} from '../../radio/ssrfGuard';
import {ProviderError} from '../../core/providerErrors';
import {retryAfterMs} from '../../core/retryAfter';
import {kugouSessionSchema,type KugouSession} from './session';
export type KugouAccountTransport=(session:KugouSession,signal:AbortSignal)=>Promise<{body:string;cookies:{name:string;value:string}[]}>;
export const requestKugouAccount:KugouAccountTransport=(input,signal)=>{
  const parsed=kugouSessionSchema.safeParse(input);if(!parsed.success)throw new ProviderError('PROVIDER_SESSION_EXPIRED');signal.throwIfAborted();
  const s=parsed.data,query=new URLSearchParams({a_id:s.appid,userid:s.userid,t:s.token,ct:s.clienttime,callback:'',domain:'kugou.com',plat:'0',dfid:s.dfid});
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'login-user.kugou.com',port:443,path:'/v1/autologin?'+query,method:'GET',signal,headers:{Referer:'https://www.kugou.com/','User-Agent':'StudyRoom-Desktop-Experimental/0.2'},
      lookup:(name,options,callback)=>lookup(name,{...options,all:true},(error,addresses)=>{if(error||!addresses.length||addresses.some(a=>!isPublicAddress(a.address))){callback(new Error('PROVIDER_NETWORK_REJECTED'),[]);return;}if(options.all)callback(null,addresses);else callback(null,addresses[0]!.address,addresses[0]!.family);})
    },response=>{
      if(response.statusCode!==200){response.destroy();const code=response.statusCode===429?'PROVIDER_RATE_LIMITED':'PROVIDER_UNAVAILABLE';reject(new ProviderError(code,code,true,response.statusCode===429?retryAfterMs(response.headers['retry-after']):undefined));return;}
      if(response.headers['ssa-code']){response.destroy();reject(new ProviderError('PROVIDER_LOGIN_REQUIRED'));return;}
      let size=0;const chunks:Buffer[]=[];
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384){response.destroy();reject(new ProviderError('PROVIDER_API_CHANGED'));return;}chunks.push(chunk);});
      response.on('error',()=>reject(new ProviderError('PROVIDER_UNAVAILABLE')));
      response.on('end',()=>{if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}const cookies=(response.headers['set-cookie']??[]).flatMap(raw=>{const pair=raw.split(';',1)[0]!,index=pair.indexOf('='),name=pair.slice(0,index);return ['KugooID','t'].includes(name)?[{name,value:pair.slice(index+1)}]:[];});resolve({body:Buffer.concat(chunks).toString('utf8'),cookies});});
    });
    const timer=setTimeout(()=>req.destroy(new ProviderError('PROVIDER_TIMEOUT')),8000);req.once('close',()=>clearTimeout(timer));
    req.on('error',e=>reject(signal.aborted?new DOMException('Aborted','AbortError'):e instanceof ProviderError?e:new ProviderError('PROVIDER_UNAVAILABLE')));req.end();
  });
};
