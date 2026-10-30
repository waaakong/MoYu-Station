import type {Router} from 'vue-router';
import {usePlayerStore} from '../stores/player';
import {useFocusStore} from '../stores/focus';
import {useSceneStore} from '../stores/scene';
import {useAuthStore} from '../stores/auth';
import {useShellStore} from '../stores/shell';
import {useSoundStore} from '../stores/sound';
export function startDesktopWheel(router:Router){
  const player=usePlayerStore(),sound=useSoundStore(),focus=useFocusStore(),scene=useSceneStore(),auth=useAuthStore(),shell=useShellStore();let pending=false,disposed=false;
  const stop=window.studyRoomDesktop?.onWheelCommand?.(command=>{
    if(disposed||pending||window.moyuStartupOverlay?.active)return;
    pending=true;const generation=auth.sessionGeneration;
    void(async()=>{
      if(command==='play-pause')await player.toggle();
      if(command==='next')await player.next();
      if(command==='previous')await player.previous();
      if(command==='mute')sound.setMusicBus(sound.settings.musicBus.volume,!sound.settings.musicBus.muted);
      if(command==='sound')await router.push({name:'sound'});
      if(command==='space')await router.push({name:'scene'});
      if(command==='focus'){
        if(focus.timerState==='running'){focus.pause();return;}
        if(focus.operationPending)throw new Error('专注记录正在保存，请稍后重试。');
        await router.push({name:'focus'});
        if(disposed||generation!==auth.sessionGeneration||!focus.spaceAllowed)return;
        if(focus.timerState==='paused')focus.resume();
        else{const session=await focus.start({plannedMinutes:25,sceneCode:scene.sceneKey,timeKey:scene.timeKey,accountScope:auth.user?.id?String(auth.user.id):undefined});scene.beginFocusSession(session.clientRecordId);}
      }
    })().catch(error=>shell.toast(error instanceof Error?error.message:'轮盘操作未完成。','error')).finally(()=>{pending=false;});
  });
  return()=>{disposed=true;stop?.();};
}
