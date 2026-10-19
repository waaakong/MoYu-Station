import {app,BrowserWindow,globalShortcut,ipcMain,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import {z} from 'zod';
import {IPC_CHANNELS,type DesktopLyricsFrame,type DesktopMusicSettings,type DesktopMusicState} from '@studyroom/contracts';
import type {LocalDatabaseStore} from '../../database/database';
import {IpcGuard} from '../ipc/guard';
import {DEFAULT_DESKTOP_MUSIC,MediaShortcuts,desktopMusicSettingsSchema} from './shortcuts';
const KEY='music.desktop-v1',FRAME='desktop-lyrics:frame',ACTION='desktop-lyrics:action';
const frameSchema=z.object({title:z.string().max(500),line:z.string().max(2000),nextLine:z.string().max(2000),status:z.string().max(100)}).strict();
export class DesktopMusic {
  private settings:DesktopMusicSettings=structuredClone(DEFAULT_DESKTOP_MUSIC);private error?:string;
  private lyrics?:BrowserWindow;private frame:DesktopLyricsFrame={title:'墨屿 · 桌面歌词',line:'暂无播放内容',nextLine:'',status:''};
  private shortcuts:MediaShortcuts;private guard:IpcGuard;private saveTimer?:NodeJS.Timeout;
  private displayChange=()=>{if(this.lyrics&&!this.lyrics.isDestroyed())this.lyrics.setBounds(this.bounds(this.lyrics.getBounds()));};
  constructor(private main:BrowserWindow,private store:LocalDatabaseStore){
    this.guard=new IpcGuard(main.webContents.id);
    this.shortcuts=new MediaShortcuts(globalShortcut,command=>{if(!main.isDestroyed())main.webContents.send(IPC_CHANNELS.mediaCommand,command);});
    const saved=desktopMusicSettingsSchema.safeParse(store.getSetting(KEY));if(saved.success)this.settings=saved.data;
    try{this.shortcuts.apply(this.settings,()=>{});}catch(error){this.error=String((error as Error).message);}
    ipcMain.handle(IPC_CHANNELS.desktopMusicRead,event=>this.guard.invoke(IPC_CHANNELS.desktopMusicRead,event,()=>this.state()));
    ipcMain.handle(IPC_CHANNELS.desktopMusicSave,(event,value)=>this.guard.invoke(IPC_CHANNELS.desktopMusicSave,event,()=>this.save(desktopMusicSettingsSchema.parse(value))));
    ipcMain.handle(IPC_CHANNELS.desktopLyricsPublish,(event,value)=>this.guard.invoke(IPC_CHANNELS.desktopLyricsPublish,event,()=>{this.frame=frameSchema.parse(value);this.sendFrame();}));
    ipcMain.handle(ACTION,(event,value)=>{
      if(!this.lyrics||event.sender!==this.lyrics.webContents||event.senderFrame!==event.sender.mainFrame||!['close','lock'].includes(value))throw new Error('LYRICS_ACTION_REJECTED');
      return this.save({...this.settings,...(value==='close'?{lyricsVisible:false}:{lyricsLocked:true})});
    });
    screen.on('display-removed',this.displayChange);screen.on('display-metrics-changed',this.displayChange);
    main.webContents.on('render-process-gone',()=>{this.frame={title:'墨屿',line:'播放器已断开',nextLine:'',status:'请重新打开主窗口'};this.sendFrame();});
    this.updateWindow();
  }
  state():DesktopMusicState{return {settings:structuredClone(this.settings),error:this.error};}
  private save(settings:DesktopMusicSettings){
    this.shortcuts.apply(settings,()=>this.store.setSetting(KEY,settings));this.settings=settings;this.error=undefined;
    this.updateWindow();const state=this.state();if(!this.main.isDestroyed())this.main.webContents.send(IPC_CHANNELS.desktopMusicState,state);return state;
  }
  private bounds(saved?:Partial<Rectangle>):Rectangle{
    const displays=screen.getAllDisplays().map(display=>display.workArea),primary=screen.getPrimaryDisplay().workArea;
    const area=displays.find(area=>Number.isFinite(saved?.x)&&Number.isFinite(saved?.y)&&saved!.x!>=area.x&&saved!.x!<area.x+area.width&&saved!.y!>=area.y&&saved!.y!<area.y+area.height)||primary;
    const width=Math.min(680,area.width),height=Math.min(160,area.height);
    return {width,height,x:Math.round(Math.min(area.x+area.width-width,Math.max(area.x,Number.isFinite(saved?.x)?saved!.x!:area.x+(area.width-width)/2))),y:Math.round(Math.min(area.y+area.height-height,Math.max(area.y,Number.isFinite(saved?.y)?saved!.y!:area.y+area.height-height-40)))};
  }
  private updateWindow(){
    if(!this.settings.lyricsVisible){this.lyrics?.hide();return;}
    if(!this.lyrics||this.lyrics.isDestroyed()){
      const window=new BrowserWindow({...this.bounds(this.store.getSetting('music.lyrics-position-v1')),show:false,frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,transparent:false,backgroundColor:'#17221f',webPreferences:{preload:join(app.getAppPath(),'dist/preload/lyrics.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,partition:'moyu-lyrics-isolated'}});
      this.lyrics=window;window.removeMenu();window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
      window.once('ready-to-show',()=>{this.sendFrame();if(this.settings.lyricsVisible)window.showInactive();});
      window.on('move',()=>{clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{if(!window.isDestroyed())this.store.setSetting('music.lyrics-position-v1',window.getBounds());},250);});
      window.on('close',event=>{event.preventDefault();this.save({...this.settings,lyricsVisible:false});});
      void window.loadFile(join(app.getAppPath(),'dist/renderer/lyrics.html')).catch(()=>{this.error='桌面歌词窗口加载失败。';window.hide();});
    }
    this.lyrics.setIgnoreMouseEvents(this.settings.lyricsLocked,{forward:true});this.lyrics.setMovable(!this.settings.lyricsLocked);this.lyrics.showInactive();this.sendFrame();
  }
  private sendFrame(){if(this.lyrics&&!this.lyrics.isDestroyed())this.lyrics.webContents.send(FRAME,{...this.frame,locked:this.settings.lyricsLocked});}
  dispose(){clearTimeout(this.saveTimer);this.shortcuts.dispose();for(const channel of [IPC_CHANNELS.desktopMusicRead,IPC_CHANNELS.desktopMusicSave,IPC_CHANNELS.desktopLyricsPublish,ACTION])ipcMain.removeHandler(channel);screen.removeListener('display-removed',this.displayChange);screen.removeListener('display-metrics-changed',this.displayChange);this.lyrics?.destroy();}
}
