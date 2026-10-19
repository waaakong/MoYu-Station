import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,stat,unlink,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import type {ProviderId} from '@studyroom/contracts';
import {pinnedMediaFetch} from '../../audio/protocol/pinnedMediaFetch';
import {artworkSource} from './artworkSource';
import {artworkImageType} from './artworkImage';
import {GlobalRequestBudget} from './requestBudget';

const MAX_IMAGE=2*1024*1024, MAX_CACHE=64*1024*1024;
const PREFIX='studyroom-media://provider-artwork/';
interface Entry {providerId:ProviderId;scope:string;url:string}
interface Options {directory:string; scope:(id:ProviderId)=>string|undefined; fetcher?:typeof fetch; maxBytes?:number}

export class ProviderArtworkCache {
  private entries=new Map<string,Entry>();
  private jobs=new Map<string,Promise<Buffer>>();
  private failures=new Map<string,number>();
  private lifetimes=new Map<ProviderId,AbortController>();
  private maintenance:Promise<unknown>=Promise.resolve();
  private readonly budget=new GlobalRequestBudget(4);
  constructor(private readonly options:Options){}
  private token(e:Entry){return createHash('sha256').update(JSON.stringify(e)).digest('hex');}
  private scope(id:ProviderId){try{return this.options.scope(id);}catch{return undefined;}}
  /** Called on trusted worker results before IPC / progressive search events. */
  metadata<T>(providerId:ProviderId,value:T):T {
    const scope=this.scope(providerId);
    const register=(raw:unknown)=>{
      const url=artworkSource(providerId,raw);
      if(!url||!scope)return undefined;
      const entry={providerId,scope,url},token=this.token(entry);
      if(this.entries.size>=4000)this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(token,entry);return token;
    };
    const walk=(item:unknown):unknown=>{
      if(Array.isArray(item))return item.map(walk);
      if(!item||typeof item!=='object'||Object.getPrototypeOf(item)!==Object.prototype)return item;
      const result:Record<string,unknown>={};
      for(const [key,v] of Object.entries(item)){
        if(key==='artworkUrl'||key==='artworkToken'){
          const token=register(v);result[key]=token?(key==='artworkUrl'?PREFIX+token:token):undefined;
        } else result[key]=walk(v);
      }
      const candidates=result.providerCandidates as Array<{artworkUrl?:string}>|undefined;
      if(candidates&&!result.artworkUrl)result.artworkUrl=candidates[0]?.artworkUrl;
      return result;
    };
    // Image metadata must never turn a successful music operation into failure.
    return walk(value) as T;
  }
  invalidate(providerId:ProviderId){
    this.lifetimes.get(providerId)?.abort();this.lifetimes.delete(providerId);
    for(const [key,e] of this.entries)if(e.providerId===providerId)this.entries.delete(key);
    this.failures.clear();
  }
  dispose(){for(const id of this.lifetimes.keys())this.invalidate(id);}
  async clear(providerId:ProviderId){
    this.invalidate(providerId);
    await this.maintenance.catch(()=>{});
    for(const name of await readdir(this.options.directory).catch(()=>[])){
      if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
      try {const e=JSON.parse(await readFile(join(this.options.directory,name),'utf8')) as Entry;
        if(e.providerId===providerId)await Promise.all([name,name.replace('.json','.img')].map(n=>unlink(join(this.options.directory,n)).catch(()=>{})));
      }catch{/* A corrupt entry is inaccessible. */}
    }
  }
  async response(request:Request):Promise<Response>{
    try{
      const url=new URL(request.url),token=url.pathname.slice(1);
      if(request.method!=='GET'||url.hostname!=='provider-artwork'||url.username||url.password||url.port||url.search||url.hash||!/^[a-f0-9]{64}$/.test(token))throw new Error();
      let entry=this.entries.get(token);
      if(!entry){
        const raw=await readFile(join(this.options.directory,token+'.json'));
        if(raw.length>4096)throw new Error();
        entry=JSON.parse(raw.toString()) as Entry;
        if(!['netease','qq','kugou'].includes(entry.providerId)||typeof entry.scope!=='string'||artworkSource(entry.providerId,entry.url)!==entry.url||this.token(entry)!==token)throw new Error();
      }
      const current=entry;
      if(this.scope(current.providerId)!==current.scope)throw new Error();
      let bytes:Buffer|undefined;
      const path=join(this.options.directory,token+'.img');
      try{const info=await stat(path);if(info.size<=MAX_IMAGE){const cached=await readFile(path);if(artworkImageType(cached))bytes=cached;}}catch{}
      if(bytes)void utimes(path,new Date(),new Date()).catch(()=>{});
      if(!bytes){
        if((this.failures.get(token)??0)>Date.now())throw new Error();
        let job=this.jobs.get(token);
        if(!job){
          job=this.download(token,current).catch(error=>{if(!(error instanceof Error&&error.name==='AbortError')){if(this.failures.size>2000)this.failures.clear();this.failures.set(token,Date.now()+30000);}throw error;}).finally(()=>this.jobs.delete(token));
          this.jobs.set(token,job);
        }
        bytes=await job;
      }
      if(this.scope(current.providerId)!==current.scope)throw new Error();
      return new Response(new Uint8Array(bytes),{headers:{'Content-Type':artworkImageType(bytes)!,'Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});}
  }
  private async download(token:string,entry:Entry):Promise<Buffer>{
    if(this.jobs.size>=64)throw new Error('ARTWORK_BUSY');
    let lifetime=this.lifetimes.get(entry.providerId);
    if(!lifetime){lifetime=new AbortController();this.lifetimes.set(entry.providerId,lifetime);}
    const signal=AbortSignal.any([lifetime.signal,AbortSignal.timeout(12000)]);
    const release=await this.budget.acquire(signal);
    try{
      const response=await(this.options.fetcher??pinnedMediaFetch)(entry.url,{signal,redirect:'error',credentials:'omit',headers:{Accept:'image/jpeg,image/png,image/webp'}});
      const mime=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if(response.status!==200||!['image/jpg','image/jpeg','image/png','image/webp'].includes(mime??'')||Number(response.headers.get('content-length'))>MAX_IMAGE){await response.body?.cancel();throw new Error();}
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks:Buffer[]=[];let size=0;
      try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE)throw new Error();chunks.push(Buffer.from(value));}}
      finally{await reader.cancel().catch(()=>{});}
      const bytes=Buffer.concat(chunks);
      // Some image CDNs label PNG bytes image/jpg. Serve the inspected raster
      // type, never the declared type; HTML/SVG/oversized rasters remain rejected.
      if(!artworkImageType(bytes))throw new Error();
      signal.throwIfAborted();if(this.scope(entry.providerId)!==entry.scope)throw new Error();
      // Serialize disk commits + eviction. Disk failure is only a cache miss.
      const write=this.maintenance.catch(()=>{}).then(async()=>{
        signal.throwIfAborted();if(this.scope(entry.providerId)!==entry.scope)throw new Error();
        await mkdir(this.options.directory,{recursive:true});
        const temporary=join(this.options.directory,token+'.tmp');
        try{
          await writeFile(temporary,bytes);
          signal.throwIfAborted();
          await rename(temporary,join(this.options.directory,token+'.img'));
          await writeFile(join(this.options.directory,token+'.json'),JSON.stringify(entry),{mode:0o600});
        }finally{
          await unlink(temporary).catch(()=>{});
          await this.prune();
        }
      });this.maintenance=write;await write.catch(()=>{});
      signal.throwIfAborted();return bytes;
    }finally{release();}
  }
  private async prune(){
    const files=await readdir(this.options.directory);
    const items=await Promise.all(files.filter(n=>/^[a-f0-9]{64}\.(img|json|tmp)$/.test(n)).map(async name=>({name,...await stat(join(this.options.directory,name))})));
    const groups=new Map<string,{names:string[];size:number;mtimeMs:number}>();
    for(const item of items){
      const token=item.name.slice(0,64),group=groups.get(token)??{names:[],size:0,mtimeMs:0};
      group.names.push(item.name);group.size+=item.size;
      group.mtimeMs=Math.max(group.mtimeMs,item.mtimeMs);groups.set(token,group);
    }
    let size=items.reduce((total,item)=>total+item.size,0);
    for(const item of [...groups.values()].sort((a,b)=>a.mtimeMs-b.mtimeMs)){
      if(size<=(this.options.maxBytes??MAX_CACHE))break;
      for(const name of item.names)await unlink(join(this.options.directory,name));size-=item.size;
    }
  }
}
