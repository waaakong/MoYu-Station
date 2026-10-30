import {app} from 'electron';
import {mkdirSync,appendFileSync} from 'node:fs';
import {join,basename} from 'node:path';
import {env,execPath,pid} from 'node:process';
export type WheelFocusTrace=(event:string,fields:Record<string,number|boolean>)=>void;
/** Explicit local experimental probe; never records titles, paths or input. */
export function createWheelFocusDiagnostics():WheelFocusTrace|undefined{
  if(env.STUDYROOM_WHEEL_FOCUS_DIAGNOSTICS!=='1'||!basename(execPath).includes('Provider Experimental'))return;
  const directory=join(app.getPath('userData'),'diagnostics');
  const file=join(directory,`wheel-focus-${Date.now()}-${pid}.jsonl`);
  const allowed=new Set(['command','before','after','settled','transfer','foreground','gesture','activation']);
  const keys=new Set(['sequence','command','visible','minimized','focused','contentFocused','granted','error','owned','topmost','controlHeld','altHeld']);
  const start=Date.now();let count=0;
  return(event,fields)=>{
    if(!allowed.has(event)||count>=128||Date.now()-start>15*60_000)return;
    const clean:Record<string,number|boolean>={};
    for(const [key,value]of Object.entries(fields))if(keys.has(key)&&(typeof value==='boolean'||Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff))clean[key]=value;
    try{mkdirSync(directory,{recursive:true});appendFileSync(file,JSON.stringify({at:Date.now(),event,...clean})+'\n',{mode:0o600});count++;}catch{/* Diagnostics must not break commands. */}
  };
}
