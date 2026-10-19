import {z} from 'zod';
import type {DesktopMusicSettings,MediaCommand} from '@studyroom/contracts';
const accelerator=z.string().max(60).regex(/^(MediaPlayPause|MediaNextTrack|MediaPreviousTrack|Control\+Alt\+(Shift\+)?([A-Z0-9]|F([1-9]|1[0-2])))$/);
export const desktopMusicSettingsSchema=z.object({shortcutsEnabled:z.boolean(),shortcuts:z.object({'play-pause':accelerator,next:accelerator,previous:accelerator}).strict(),lyricsVisible:z.boolean(),lyricsLocked:z.boolean()}).strict().refine(value=>new Set(Object.values(value.shortcuts).map(key=>key.toLowerCase())).size===3,'快捷键不能重复');
export const DEFAULT_DESKTOP_MUSIC:DesktopMusicSettings={shortcutsEnabled:true,shortcuts:{'play-pause':'MediaPlayPause',next:'MediaNextTrack',previous:'MediaPreviousTrack'},lyricsVisible:false,lyricsLocked:false};
interface Registry {register:(key:string,callback:()=>void)=>boolean;unregister:(key:string)=>void}
/** Stage new registrations first; conflicts or persistence failure leave existing bindings untouched. */
export class MediaShortcuts {
  private owned=new Set<string>();private commands=new Map<string,MediaCommand>();
  constructor(private registry:Registry,private send:(command:MediaCommand)=>void){}
  apply(settings:DesktopMusicSettings,persist:()=>void){
    const next=new Map<string,MediaCommand>(settings.shortcutsEnabled?Object.entries(settings.shortcuts).map(([command,key])=>[key,command as MediaCommand]):[]),added:string[]=[];
    try{
      for(const key of next.keys())if(!this.owned.has(key)){
        if(!this.registry.register(key,()=>{const command=this.commands.get(key);if(command)this.send(command);}))throw new Error(`快捷键 ${key} 已被占用，原设置未改变。`);
        added.push(key);
      }
      persist();
    }catch(error){for(const key of added)this.registry.unregister(key);throw error;}
    for(const key of this.owned)if(!next.has(key))this.registry.unregister(key);
    this.commands=next;this.owned=new Set(next.keys());
  }
  dispose(){for(const key of this.owned)this.registry.unregister(key);this.owned.clear();this.commands.clear();}
}
