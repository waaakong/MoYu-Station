import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {reactive} from 'vue';
const fixture=vi.hoisted(()=>({auth:null as any,get:vi.fn(),cleanup:[] as (()=>void)[]}));
vi.mock('vue',async original=>({...await original<typeof import('vue')>(),onBeforeUnmount:(fn:()=>void)=>fixture.cleanup.push(fn)}));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>fixture.auth}));
vi.mock('../src/services/http',()=>({http:{get:fixture.get}}));
import {useLiveActivity} from '../src/activity/live';
import {activityState} from '../src/activity/state';
const t=Date.parse('2026-10-25T00:00:00+08:00');
async function settle(){for(let i=0;i<10;i++)await Promise.resolve();}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(t+60000);
  fixture.auth=reactive({user:{id:'1'},sessionGeneration:1,authTransition:false,isBanned:false});
  Object.assign(activityState,{owner:'1',enabled:true,relaxTiming:true,pending:1,error:'',observed:[{startMs:t,endMs:t+60000,state:'RELAX'}]});
  fixture.get.mockResolvedValue({data:{data:{date:'2026-10-25',timeZone:'Asia/Shanghai',segments:[{startMs:t,endMs:t+60000,state:'RELAX'}],partial:false,hasLegacy:false}}});
});
afterEach(()=>{for(const fn of fixture.cleanup.splice(0))fn();vi.useRealTimers();});
describe('live account-scoped statistics',()=>{
  it('unions already confirmed local copies, refreshes each second and keeps offline estimates',async()=>{
    const live=useLiveActivity();await settle();expect(live.totals.value).toMatchObject({onlineMs:60000,fishMs:60000,index:2});
    activityState.observed.push({startMs:t+60000,endMs:t+61000,state:'ONLINE'});await vi.advanceTimersByTimeAsync(1000);
    expect(live.totals.value?.onlineMs).toBe(61000);expect(live.totals.value?.index).toBeCloseTo(120/61);
    fixture.get.mockRejectedValue(new Error('offline'));await live.refresh();expect(live.error.value).toContain('保留本机');expect(live.totals.value?.fishMs).toBe(60000);
  });
  it('discards a late old-account response and never shows that account after switching',async()=>{
    let resolve!:(value:unknown)=>void;fixture.get.mockReturnValueOnce(new Promise(r=>resolve=r));
    const live=useLiveActivity();fixture.auth.user={id:'2'};fixture.auth.sessionGeneration++;activityState.owner='2';activityState.observed=[];
    await settle();resolve({data:{data:{date:'2026-10-25',timeZone:'Asia/Shanghai',segments:[{startMs:t,endMs:t+60000,state:'RELAX'}],partial:false,hasLegacy:false}}});await settle();
    expect(live.totals.value?.fishMs).toBe(0);fixture.auth.user=null;await settle();expect(live.totals.value).toBeNull();
  });
  it('resets at Shanghai midnight without carrying yesterday into today',async()=>{
    vi.setSystemTime(t+86400000-500);fixture.get.mockResolvedValue({data:{data:{date:'2026-10-26',timeZone:'Asia/Shanghai',segments:[],partial:false,hasLegacy:false}}});
    const live=useLiveActivity();await vi.advanceTimersByTimeAsync(1000);expect(live.totals.value?.onlineMs).toBe(0);expect(live.totals.value?.index).toBeNull();
  });
});
