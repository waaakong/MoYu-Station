import { reactive } from 'vue';
import type { ReliableCreateKind, ReliableCreateReceipt, EntityId } from '@studyroom/contracts';
import { entityId } from '@studyroom/contracts';
import { http } from './http';
import { useAuthStore } from '../stores/auth';
import { isUnknownWriteOutcome } from './writeOutcome';

interface Task { id:string; payload:Record<string,unknown>; unknown:boolean; busy:boolean }
export const createTasks=reactive<Record<string,Task>>({});
export const feedbackDraft=reactive({title:'',content:'',feedbackType:'SUGGESTION'});
export const invitationDraft=reactive({label:'',maxUses:1,expiresAt:''});
const flights=new Map<string,Promise<unknown>>();
let epoch=0;
export function clearReliableCreates() {
  epoch++; flights.clear();
  for(const key of Object.keys(createTasks))delete createTasks[key];
  Object.assign(feedbackDraft,{title:'',content:'',feedbackType:'SUGGESTION'});
  Object.assign(invitationDraft,{label:'',maxUses:1,expiresAt:''});
}

/** Explicit user calls only. Nothing is submitted on reconnect, mount, or foreground restore. */
export function reliableCreate<T>(options:{slot:string;kind:ReliableCreateKind;url:string;payload:Record<string,unknown>;recover:(target:EntityId)=>Promise<T>}):Promise<T> {
  const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration,started=epoch;
  const guard=()=>{if(!owner || owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition || started!==epoch)throw new DOMException('账号会话已结束','AbortError');};
  guard();
  let task=createTasks[options.slot];
  if(task && JSON.stringify(task.payload)!==JSON.stringify(options.payload))return Promise.reject(new Error('原提交尚未核对，不能改换内容或目标。请先核对原请求。'));
  const active=flights.get(options.slot); if(active)return active as Promise<T>;
  if(!task){createTasks[options.slot]={id:crypto.randomUUID(),payload:JSON.parse(JSON.stringify(options.payload)),unknown:false,busy:false};task=createTasks[options.slot];}
  task.busy=true;
  const original=task, config={mediaGuard:guard};
  const run=(async()=>{
    let posting=false;
    try {
      const capabilities=await http.get('/operations/capabilities',config);guard();
      if(capabilities.data?.data?.reliableCreate!==true)throw new Error('当前服务未开启可靠提交，内容已保留。');
      if(original.unknown) {
        const response=await http.get(`/operations/${options.kind}/${original.id}`,config);guard();
        const receipt=response.data?.data as ReliableCreateReceipt;
        if(receipt?.requestId!==original.id || !['missing','committed'].includes(receipt.status))throw new Error('无法核对原提交结果，请稍后再次核对。');
        if(receipt.status==='committed') {
          const result=await options.recover(entityId(receipt.targetId));guard();delete createTasks[options.slot];return result;
        }
      }
      guard();posting=true;
      const response=await http.post(options.url,{...original.payload,clientRequestId:original.id},config);guard();
      entityId(response.data?.data?.id);
      delete createTasks[options.slot];return response.data.data as T;
    } catch(error) {
      guard();
      const code=(error as {code?:string})?.code;
      if(posting && (isUnknownWriteOutcome(error) || code==='CREATE_ALREADY_COMMITTED' || code==='CREATE_REQUEST_CONFLICT'))original.unknown=true;
      if(!original.unknown)delete createTasks[options.slot];
      if(original.unknown)throw new Error('提交结果未确认，内容已保留。请点击“核对并重试”，将查询原请求，不创建新的提交。');
      throw error;
    } finally {
      if(started===epoch)original.busy=false;
    }
  })();
  flights.set(options.slot,run);
  void run.finally(()=>{if(flights.get(options.slot)===run)flights.delete(options.slot);}).catch(()=>{});
  return run;
}
