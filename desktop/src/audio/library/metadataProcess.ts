import {fork} from 'node:child_process';
import {resolve} from 'node:path';
import {z} from 'zod';
export interface MetadataWorker {readonly pid?:number;on(event:string,listener:(...args:any[])=>void):unknown;postMessage?(value:string):void;send?(value:string):unknown;kill():unknown}
const resultSchema=z.object({title:z.string().max(500).optional(),artist:z.string().max(500).optional(),album:z.string().max(500).optional(),durationMs:z.number().finite().min(0).max(86400000).optional(),lyrics:z.string().max(512*1024).optional(),cover:z.object({data:z.instanceof(Uint8Array).refine(data=>data.byteLength<=2*1024*1024),mime:z.string().max(100)}).strict().optional()}).strict();
export type MetadataProcessResult=z.infer<typeof resultSchema>;
const allowedEnvironment=new Set(['systemroot','windir','temp','tmp','path','lang','lc_all']);
export function metadataEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([name])=>allowedEnvironment.has(name.toLowerCase())));}
let factory:()=>MetadataWorker=()=>fork(resolve('src/audio/library/metadata-worker.mjs'),[],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',execArgv:['--max-old-space-size=96'],env:metadataEnvironment()}) as MetadataWorker;
export function configureMetadataWorkerFactory(value:()=>MetadataWorker){factory=value;}
let active=0;
/** Every parse has its own killable process. No unbounded queue or inherited secrets. */
export function parseMetadataProcess(path:string,options:{timeoutMs?:number;create?:()=>MetadataWorker}={}):Promise<MetadataProcessResult>{
  if(active>=2)return Promise.reject(new Error('METADATA_BUSY'));
  active++;
  return new Promise((resolveResult,reject)=>{
    let worker:MetadataWorker|undefined,timer:NodeJS.Timeout|undefined,finished=false,released=false;
    const release=()=>{if(!released){released=true;active--;}};
    const finish=(error?:Error,result?:MetadataProcessResult)=>{if(finished)return;finished=true;clearTimeout(timer);try{worker?.kill();}catch{}if(!worker)release();if(error)reject(error);else resolveResult(result!);};
    try{
      worker=(options.create||factory)();
      worker.on('exit',()=>{release();finish(new Error('METADATA_WORKER_EXITED'));});
      worker.on('error',()=>{if(worker?.pid===undefined)release();finish(new Error('METADATA_WORKER_FAILED'));});
      worker.on('message',value=>{const parsed=resultSchema.safeParse(value);finish(parsed.success?undefined:new Error('METADATA_RESULT_INVALID'),parsed.success?parsed.data:undefined);});
      timer=setTimeout(()=>finish(new Error('METADATA_PARSE_TIMEOUT')),options.timeoutMs??5000);
      if(worker.postMessage)worker.postMessage(path);else worker.send?.(path);
    }catch{finish(new Error('METADATA_WORKER_FAILED'));}
  });
}
