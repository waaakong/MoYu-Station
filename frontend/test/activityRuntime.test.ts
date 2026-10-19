import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {reactive} from 'vue';
const fixture=vi.hoisted(()=>({auth:null as any,focus:null as any,records:new Map<string,any>(),get:vi.fn(),post:vi.fn(),write:vi.fn()}));
vi.mock('../src/stores/auth',()=>({useAuthStore:()=>fixture.auth}));
vi.mock('../src/stores/focus',()=>({useFocusStore:()=>fixture.focus}));
vi.mock('../src/services/http',()=>({http:{get:fixture.get,post:fixture.post}}));
vi.mock('../src/window/quitPreparation',()=>({registerQuitSaver:()=>()=>{}}));
vi.mock('../src/activity/storage',()=>({writeActivity:(r:any)=>fixture.write(r),readActivity:async(owner:string)=>[...fixture.records.values()].filter(r=>r.owner===owner),deleteActivity:async(id:string)=>{fixture.records.delete(id);}}));
import {startActivityRuntime,flushActivity} from '../src/activity/runtime';
import {activityState} from '../src/activity/state';
let stop:()=>void;
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date','setInterval','clearInterval','performance']});vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
  fixture.records.clear();fixture.auth=reactive({user:{id:'1'},isBanned:false,authTransition:false,sessionGeneration:1});fixture.focus=reactive({timerState:'idle',session:null});
  fixture.write.mockImplementation(async r=>{fixture.records.set(r.batch.requestId,structuredClone(r));});
  fixture.get.mockImplementation(async url=>{if(url.endsWith('capabilities'))return {data:{data:{version:2}}};throw new Error('fixture offline');});
  fixture.post.mockReset();
  vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{locks:{request:async(_name:any,options:any,callback:any)=>{await (callback||options)({});}}});
  stop=startActivityRuntime();await settle();expect(activityState.enabled).toBe(true);
});
afterEach(async()=>{stop();await settle();vi.useRealTimers();vi.unstubAllGlobals();});
describe('persistent activity runtime',()=>{
  it('seals before a long wall gap without extrapolating or oversizing a batch',async()=>{
    await vi.advanceTimersByTimeAsync(2000);vi.setSystemTime(Date.now()+120000);await vi.advanceTimersByTimeAsync(2000);await flushActivity();
    const records=[...fixture.records.values()].sort((a,b)=>a.batch.sequence-b.batch.sequence);
    expect(records.length).toBe(2);expect(records.map(r=>r.batch.sequence)).toEqual([1,2]);
    expect(records.every(r=>r.sealed&&r.batch.segments.at(-1).endMs-r.batch.segments[0].startMs<=5000)).toBe(true);
    expect(records.reduce((sum,r)=>sum+r.batch.segments.reduce((n:number,s:any)=>n+s.endMs-s.startMs,0),0)).toBe(3000);
  });
  it('keeps offline records scoped to their original account on a switch',async()=>{
    await vi.advanceTimersByTimeAsync(2000);fixture.auth.user={id:'2'};fixture.auth.sessionGeneration++;await settle();await vi.advanceTimersByTimeAsync(2000);await flushActivity();
    expect(new Set([...fixture.records.values()].map(r=>r.owner))).toEqual(new Set(['1','2']));expect(fixture.post).not.toHaveBeenCalled();expect(activityState.owner).toBe('2');
  });
  it('stops collecting and reports durable storage failure',async()=>{
    fixture.write.mockRejectedValue(new Error('disk full'));await vi.advanceTimersByTimeAsync(2000);
    expect(activityState.enabled).toBe(false);expect(activityState.error).toContain('未能保存');
  });
  it('retains a rejected old stream without blocking another stream behind its backlog',async()=>{
    for(let i=1;i<=150;i++)fixture.records.set(`old-${i}`,{owner:'1',sealed:true,batch:{requestId:`old-${i}`,sessionId:'000-old',sequence:i,segments:[]}});
    fixture.get.mockImplementation(async url=>{if(url.includes('/old-'))throw new Error('旧批次待核对');return {data:{data:{status:'unconfirmed'}}};});
    fixture.post.mockImplementation(async(_url,batch)=>({data:{data:{status:'committed',requestId:batch.requestId,sequence:batch.sequence}}}));
    await vi.advanceTimersByTimeAsync(6000);await flushActivity();
    expect(fixture.post).toHaveBeenCalled();expect([...fixture.records.values()].every(r=>r.batch.sessionId==='000-old')).toBe(true);
    expect(fixture.records.size).toBe(150);expect(activityState.error).toBe('旧批次待核对');
  });
});
