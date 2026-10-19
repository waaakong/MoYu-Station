import {watch} from 'vue';
import {useAuthStore} from '../stores/auth';
import {createChatSocket} from '../services/chat';
import {privateSceneApi} from './privateApi';
import {privateScene} from './privateSession';
import {startPrivateSceneCache,readPrivateSceneCache} from './privateCache';

/** Refresh saved configuration only; reconnect never submits a draft or upload job. */
export function startPrivateSceneRuntime(){
  const auth=useAuthStore();let socket:ReturnType<typeof createChatSocket>|undefined;
  const stopCache=startPrivateSceneCache();
  const refresh=()=>{if(document.visibilityState==='visible' && auth.isLoggedIn && !auth.authTransition)void privateSceneApi().refresh();};
  const stopAuth=watch(()=>[auth.user?.id,auth.sessionGeneration,auth.authTransition],async()=>{
    socket?.close();socket=undefined;
    const owner=auth.user?.id,generation=auth.sessionGeneration;
    const current=()=>!!owner && auth.user?.id===owner && generation===auth.sessionGeneration && !auth.authTransition && !auth.isBanned;
    if(!current())return;
    await readPrivateSceneCache(current,String(owner));
    if(current())refresh();
  },{immediate:true});
  const stopEnabled=watch(()=>[privateScene.enabled,auth.user?.id,auth.sessionGeneration,auth.authTransition],()=>{
    socket?.close();socket=undefined;
    if(!privateScene.enabled || !auth.isLoggedIn || auth.authTransition || auth.isBanned)return;
    socket=createChatSocket({onMessage:(message:any)=>{if(message.type==='SCENE_INVALIDATED')refresh();},onOpen:()=>refresh()});
  });
  const online=()=>{refresh();socket?.retryNow();};
  const heartbeat=window.setInterval(()=>socket?.send({type:'PING'}),25000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',online);
  return()=>{stopAuth();stopEnabled();stopCache();socket?.close();window.clearInterval(heartbeat);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',online);};
}
