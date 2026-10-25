import {computed,onBeforeUnmount,ref,watch} from 'vue';
import type {ActivityLive} from '@studyroom/contracts';
import {useAuthStore} from '../stores/auth';
import {http} from '../services/http';
import {activityState} from './state';
import {projectActivity,shanghaiDate} from './projection';

/** Server and local intervals are unioned, including already committed outbox copies. */
export function useLiveActivity(){
  const auth=useAuthStore(),snapshot=ref<ActivityLive|null>(null),now=ref(Date.now()),error=ref('');
  let epoch=0,inFlight=false,disposed=false;
  const owner=()=>auth.user&&!auth.authTransition&&!auth.isBanned?String(auth.user.id):'';
  const eligible=()=>!!owner()&&activityState.owner===owner()&&activityState.relaxTiming;
  async function refresh(){
    if(inFlight||!eligible()||disposed)return;
    const ticket=epoch,scope=owner();inFlight=true;
    const valid=()=>!disposed&&ticket===epoch&&scope===owner();
    try{
      const result=(await http.get('/activity/live',{mediaGuard:()=>{if(!valid())throw new DOMException('账号已变更','AbortError');}})).data.data as ActivityLive;
      if(!valid())return;
      if(result.timeZone!=='Asia/Shanghai'||!Array.isArray(result.segments)||result.date!==shanghaiDate())throw new Error('日期不匹配');
      snapshot.value=result;error.value='';
    }catch{if(valid())error.value='云端实时记录暂不可用，保留本机计时；恢复联网后重试。';}
    finally{inFlight=false;}
  }
  watch(()=>[owner(),auth.sessionGeneration,activityState.relaxTiming],()=>{epoch++;snapshot.value=null;error.value='';void refresh();},{immediate:true,flush:'sync'});
  const stopRevision=watch(()=>activityState.revision,()=>{void refresh();});
  const tick=setInterval(()=>{const old=shanghaiDate(now.value);now.value=Date.now();if(old!==shanghaiDate(now.value)){snapshot.value=null;void refresh();}},1000);
  const sync=setInterval(()=>{void refresh();},15000);
  const totals=computed(()=>{
    if(!eligible())return null;
    const date=shanghaiDate(now.value),remote=snapshot.value?.date===date?snapshot.value:null;
    const value=projectActivity([...(remote?.segments||[]),...activityState.observed],date,now.value);
    return {...value,estimated:!remote||!!remote.partial||!!remote.hasLegacy||value.hasLegacy||activityState.pending>0||!!activityState.error};
  });
  onBeforeUnmount(()=>{disposed=true;epoch++;clearInterval(tick);clearInterval(sync);stopRevision();});
  return {totals,error,refresh};
}
