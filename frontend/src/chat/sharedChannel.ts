import {RealtimeConnection,websocketUrl,type RealtimeState} from '../realtime/realtimeConnection';
import {hidePrivateMessage} from './chatMemory';
import {assertExactEntityIds} from '../services/entityBoundary';
type Listener={onMessage?:(value:any)=>void;onOpen?:(recovered:boolean)=>void|Promise<void>;onStateChange?:(state:RealtimeState)=>void};
type Channel={scope:string;connection:RealtimeConnection<any>;listeners:Set<Listener>};
let channel:Channel|undefined;
function invoke<T>(callback:((value:T)=>void|Promise<void>)|undefined,value:T){try{void Promise.resolve(callback?.(value)).catch(()=>{});}catch{/* One consumer must not interrupt the other subscribers. */}}
export function closeSharedChatChannel(){const previous=channel;channel=undefined;if(previous){previous.connection.close();previous.listeners.clear();}}
/** Electron permits one stream per kind. Route and global features subscribe rather than competing. */
export function acquireChatChannel(scope:string,listener:Listener){
  if(channel?.scope!==scope)closeSharedChatChannel();
  let created=false;
  if(!channel){
    const listeners=new Set<Listener>();
    const connection=new RealtimeConnection({url:websocketUrl('/ws/chat'),parse:value=>{const result=JSON.parse(String(value));assertExactEntityIds(result);return result;},
      onMessage:value=>{if(value?.type==='PRIVATE_MESSAGE_DELETED')hidePrivateMessage(String(value.payload?.messageId),String(value.payload?.peerId));for(const item of [...listeners])invoke(item.onMessage,value);},
      onOpen:recovered=>{for(const item of [...listeners])invoke(item.onOpen,recovered);},
      onStateChange:state=>{for(const item of [...listeners])invoke(item.onStateChange,state);},
      onProtocolError:()=>{for(const item of [...listeners])invoke(item.onMessage,{type:'ERROR',payload:{message:'聊天消息解析失败。'}});}});
    channel={scope,connection,listeners};created=true;
  }
  const current=channel;current.listeners.add(listener);let closed=false;
  if(created)current.connection.start();
  else queueMicrotask(()=>{if(!closed && channel===current){invoke(listener.onStateChange,current.connection.state);if(current.connection.state==='open')invoke(listener.onOpen,false);}});
  return{
    get state(){return closed?'closed':current.connection.state;},
    send(value:unknown){return !closed && channel===current && current.connection.send(value);},
    retryNow(){if(!closed && channel===current)current.connection.retryNow();},
    close(){if(closed)return;closed=true;current.listeners.delete(listener);if(channel===current && !current.listeners.size)closeSharedChatChannel();}
  };
}
