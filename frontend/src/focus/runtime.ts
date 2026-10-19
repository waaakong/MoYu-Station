import { watch } from 'vue';
import { useFocusStore } from '../stores/focus';
import { useSceneStore } from '../stores/scene';
import { useAuthStore } from '../stores/auth';
import { syncPendingFocusRecords } from '../services/focusSync';

/** One application-lifetime clock. Route components only render the same session. */
export function startFocusRuntime(){
  const focus=useFocusStore(),scene=useSceneStore(),auth=useAuthStore();
  focus.hydrate();let saving=false,disposed=false;
  let lastWall=Date.now(),lastMonotonic=performance.now();
  if(focus.session)scene.restoreFocusSession({sessionId:focus.session.clientRecordId,sceneKey:focus.session.sceneCode,timeKey:focus.session.timeKey});
  async function tick(){
    const wall=Date.now(),monotonic=performance.now();
    const wallGap=wall-lastWall,monotonicGap=monotonic-lastMonotonic;
    // Frozen pages and sleep are unknown intervals. Also reject wall-clock jumps.
    if(focus.timerState==='running' && (wallGap<0 || wallGap>5000 || monotonicGap>5000 || Math.abs(wallGap-monotonicGap)>1500)) {
      focus.pause(Math.max(focus.session!.segmentStartedAt!,lastWall));
    }
    lastWall=wall;lastMonotonic=monotonic;
    if(disposed || saving || focus.operationPending || !focus.refresh())return;
    saving=true;
    try{const record=await focus.complete();if(!focus.session)scene.endFocusSession();if(record?.syncPolicy==='automatic' && record.accountScope===String(auth.user?.id))void syncPendingFocusRecords(record.accountScope).catch(()=>{});}
    catch{focus.pause();}
    finally{saving=false;}
  }
  const stop=watch(()=>[focus.timerState,focus.activeRecordId],()=>{
    const active=focus.timerState==='running';localStorage.setItem('studyroom-focus-active',active?'1':'0');
    window.dispatchEvent(new CustomEvent('studyroom:focus-state',{detail:{active}}));
  },{immediate:true});
  const timer=window.setInterval(()=>void tick(),1000);
  const syncTimer=window.setInterval(()=>{if(auth.user&&!auth.authTransition&&!auth.isBanned)void syncPendingFocusRecords(String(auth.user.id),true).catch(()=>{});},60000);
  const suspend=()=>{if(focus.timerState==='running')focus.pause(Math.max(focus.session!.segmentStartedAt!,lastWall));};
  const stopLifecycle=window.studyRoomDesktop?.onDesktopLifecycle?.(event=>{if(event.type==='suspend')suspend();else void tick();});
  const stopIdentity=watch(()=>[auth.user?.id,auth.sessionGeneration],()=>{if(focus.timerState==='running')focus.pause();},{flush:'sync'});
  window.addEventListener('pagehide',suspend);
  const wake=()=>void tick();document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);void tick();
  return()=>{suspend();disposed=true;window.clearInterval(timer);window.clearInterval(syncTimer);stop();stopIdentity();stopLifecycle?.();window.removeEventListener('pagehide',suspend);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);};
}
