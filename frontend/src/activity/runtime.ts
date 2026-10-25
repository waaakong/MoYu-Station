import {watch} from 'vue';
import type {ActivityBatch,ActivityReceipt,ActivitySegment} from '@studyroom/contracts';
import {useAuthStore} from '../stores/auth';
import {useFocusStore} from '../stores/focus';
import {http} from '../services/http';
import {registerQuitSaver} from '../window/quitPreparation';
import {ActivitySampler} from './sampler';
import {readActivity,writeActivity,deleteActivity} from './storage';
import {activityState} from './state';

let flushRuntime:()=>Promise<void>=async()=>{};
export const flushActivity=()=>flushRuntime();
export function startActivityRuntime(routeName:()=>unknown=()=>undefined){
  const auth=useAuthStore(),focus=useFocusStore();
  let epoch=0,owner='',session='',sequence=0,sampler=new ActivitySampler(),batch:ActivityBatch|undefined;
  let saving=Promise.resolve(),uploading=false,stopped=false,suspended=false,enabled=false,backlogPaused=false;
  // Cloud capability/sync failures do not imply unsaved local data. Keep a local
  // persistence fault separately, including across account/UI error transitions.
  let localSaveError='';
  function observe(segment:ActivitySegment){
    const cutoff=Date.now()-86400000;
    activityState.observed=activityState.observed.filter(s=>s.endMs>cutoff);
    const last=activityState.observed.at(-1);
    if(last?.state===segment.state&&last.endMs===segment.startMs)last.endMs=segment.endMs;
    else activityState.observed.push({...segment});
  }
  let releaseStream:(()=>void)|undefined;
  const identity=()=>!auth.authTransition&&!auth.isBanned&&auth.user?String(auth.user.id):'';
  const valid=(ticket:number,scope:string)=>!stopped&&ticket===epoch&&identity()===scope;
  function persist(sealed:boolean){
    if(!batch?.segments.length)return;
    const record={owner,batch:structuredClone(batch),sealed},ticket=epoch;
    activityState.pending=Math.max(1,activityState.pending);
    saving=saving.then(()=>writeActivity(record)).catch(()=>{localSaveError='活动记录未能保存，计时采集已暂停。请检查本机存储并重启；已保存记录不会删除。';if(ticket===epoch){enabled=false;activityState.enabled=false;activityState.error=localSaveError;}});
    if(sealed)batch=undefined;
  }
  function tick(){
    if(!enabled||backlogPaused||suspended||identity()!==owner)return;
    const focusing=focus.timerState==='running'&&focus.session?.accountScope===owner;
    const state=activityState.relaxTiming?(routeName()==='entertainment'?'RELAX':focusing?'FOCUS_V3':'ONLINE'):focusing?'FOCUS':'IDLE';
    const segment=sampler.sample(Date.now(),performance.now(),state);
    if(!segment)return;
    observe(segment);
    // A resumed tab must not stretch a small checkpoint across a long sleep/freeze.
    if(batch?.segments.length && segment.startMs!==batch.segments.at(-1)!.endMs){batch.partial=true;persist(true);}
    batch??={requestId:crypto.randomUUID(),sessionId:session,sequence:++sequence,segments:[],partial:false};
    batch.partial ||= sampler.partial;
    sampler.partial=false;
    // Coalesce only adjacent equal states; never bridge an unobserved gap.
    const previous=batch.segments.at(-1);
    if(previous?.state===segment.state&&previous.endMs===segment.startMs&&segment.endMs-previous.startMs<=30000)previous.endMs=segment.endMs;
    else batch.segments.push(segment);
    if(segment.endMs-batch.segments[0]!.startMs>=5000){persist(true);}
    else persist(false);
  }
  async function upload(){
    if(uploading||!enabled||!owner)return;
    const ticket=epoch,scope=owner,currentSession=session;uploading=true;
    const guard=()=>{if(!valid(ticket,scope))throw new DOMException('账号已变更','AbortError');};
    try{
      await saving;guard();const records=(await readActivity(scope)).sort((a,b)=>a.batch.sessionId.localeCompare(b.batch.sessionId)||a.batch.sequence-b.batch.sequence);guard();
      activityState.pending=records.length;
      if(records.length>20000){persist(true);backlogPaused=true;sampler.suspend();activityState.enabled=false;}
      const failedStreams=new Set<string>();let failure='',attempted=0;
      for(const record of records.filter(item=>item.sealed||item.batch.sessionId!==currentSession)){
        if(failedStreams.has(record.batch.sessionId))continue;
        if(attempted++>=100)break;
        const send=async()=>{
        guard();
        // Query original receipt first: a lost response must not duplicate a committed interval.
        let result=(await http.get(`/activity/requests/${record.batch.requestId}`,{mediaGuard:guard})).data.data as ActivityReceipt;guard();
        if(result.status!=='committed')result=(await http.post('/activity/intervals',record.sealed?record.batch:{...record.batch,partial:true},{mediaGuard:guard})).data.data;
        guard();if(result.status!=='committed'||result.requestId!==record.batch.requestId||result.sequence!==record.batch.sequence)throw new Error('活动同步结果未确认，保留原记录。');
        await deleteActivity(record.batch.requestId);activityState.pending=Math.max(0,activityState.pending-1);activityState.revision++;
        };
        try{
          if(record.batch.sessionId===currentSession)await send();
          else if(navigator.locks)await navigator.locks.request(`moyu-activity:${record.batch.sessionId}`,{ifAvailable:true},async lock=>{if(lock)await send();});
        }catch(error){guard();failedStreams.add(record.batch.sessionId);failure=error instanceof Error?error.message:'活动记录待联网同步。';}
      }
      await saving;guard();const remaining=await readActivity(scope);guard();activityState.pending=remaining.length;
      if(backlogPaused&&activityState.pending<10000){backlogPaused=false;sampler.partial=true;activityState.enabled=true;tick();}
      activityState.error=failure||(backlogPaused?'活动待同步记录过多，已暂停采集，正在继续同步已保存记录。':'');
    }catch(error){if(valid(ticket,scope))activityState.error=error instanceof Error?error.message:'活动记录待联网同步。';}
    finally{uploading=false;}
  }
  async function flush(){tick();persist(true);await saving;await upload();}
  flushRuntime=flush;
  const stopIdentity=watch(()=>[identity(),auth.sessionGeneration],async()=>{
    persist(true);const previousRelease=releaseStream;releaseStream=undefined;void saving.then(()=>previousRelease?.());enabled=false;backlogPaused=false;epoch++;const ticket=epoch;owner=identity();session=crypto.randomUUID();sequence=0;batch=undefined;sampler=new ActivitySampler();
    Object.assign(activityState,{owner,sessionId:'',enabled:false,pending:0,error:'',relaxTiming:false,observed:[]});if(!owner)return;
    const scope=owner;
    try{const response=await http.get('/activity/capabilities',{mediaGuard:()=>{if(!valid(ticket,scope))throw new DOMException('账号已变更','AbortError');}});
      if(!valid(ticket,scope)||response.data.data?.version!==2)return;
      activityState.relaxTiming=response.data.data?.relaxTimingVersion===1;
      await saving;if(!valid(ticket,scope))return;
      const stored=await readActivity(scope);if(!valid(ticket,scope))return;
      for(const record of stored)for(const segment of record.batch.segments)observe(segment);
      if(!navigator.locks)throw new Error('当前浏览器无法安全协调活动账本。');
      const stream=session;
      await new Promise<void>(resolve=>{void navigator.locks.request(`moyu-activity:${stream}`,async()=>{if(!valid(ticket,scope)){resolve();return;}await new Promise<void>(release=>{releaseStream=release;resolve();});});});
      if(!valid(ticket,scope))return;enabled=true;Object.assign(activityState,{enabled:true,sessionId:session});tick();void upload();
    }catch{if(valid(ticket,scope))activityState.error='在线账本暂不可用，原专注记录仍正常保存。';}
  },{immediate:true,flush:'sync'});
  const stopFocus=watch(()=>focus.timerState,tick,{flush:'sync'});
  const stopRoute=watch(routeName,tick,{flush:'sync'});
  const timer=setInterval(tick,1000),syncTimer=setInterval(()=>{void upload();},15000);
  function suspend(){tick();persist(true);sampler.suspend();suspended=true;}
  function resume(){suspended=false;sampler.suspend();tick();void upload();}
  const stopLifecycle=window.studyRoomDesktop?.onDesktopLifecycle(event=>{if(event.type==='suspend')suspend();else resume();});
  window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',resume);
  const stopQuit=registerQuitSaver(async()=>{suspend();await saving;if(localSaveError)throw new Error(localSaveError);},resume);
  return ()=>{suspend();stopped=true;epoch++;void saving.then(()=>releaseStream?.());stopIdentity();stopFocus();stopRoute();stopLifecycle?.();stopQuit();clearInterval(timer);clearInterval(syncTimer);window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',resume);flushRuntime=async()=>{};};
}
