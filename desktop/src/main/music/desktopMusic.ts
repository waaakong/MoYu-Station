import {app,BrowserWindow,ipcMain,screen,type Rectangle} from 'electron';
import {join} from 'node:path';
import {z} from 'zod';
import {IPC_CHANNELS,type DesktopLyricsFrame,type DesktopMusicSettings,type DesktopMusicState} from '@studyroom/contracts';
import type {LocalDatabaseStore} from '../../database/database';
import {IpcGuard} from '../ipc/guard';
import {DEFAULT_DESKTOP_MUSIC,desktopMusicSettingsSchema,readDesktopMusicSettings} from './shortcuts';
import {lyricsFrameSchema,LYRICS_ACTIONS} from './lyricsProtocol';
import {DesktopWheel} from './desktopWheel';
const KEY='music.desktop-v1',FRAME='desktop-lyrics:frame',ACTION='desktop-lyrics:action';
export class DesktopMusic {
  private settings:DesktopMusicSettings=structuredClone(DEFAULT_DESKTOP_MUSIC);private error?:string;
  private lyrics?:BrowserWindow;private frame:DesktopLyricsFrame={title:'墨屿 · 桌面歌词',line:'暂无播放内容',nextLine:'',status:''};
  private guard:IpcGuard;private saveTimer?:NodeJS.Timeout;
  private lyricGuard?:IpcGuard;
  private wheel:DesktopWheel;private wheelReady:Promise<void>;private saving=false;
  private displayChange=()=>{if(this.lyrics&&!this.lyrics.isDestroyed())this.lyrics.setBounds(this.bounds(this.lyrics.getBounds()));};
  constructor(private main:BrowserWindow,private store:LocalDatabaseStore){
    this.guard=new IpcGuard(main.webContents.id);
    this.settings=readDesktopMusicSettings(store.getSetting(KEY));
    this.wheel=new DesktopWheel(command=>{
      if(command==='lyrics'){void this.toggleLyrics().catch(()=>{});return;}
      if(['sound','space','focus'].includes(command)){if(main.isMinimized())main.restore();main.show();main.focus();}
      if(!main.isDestroyed())main.webContents.send(IPC_CHANNELS.desktopWheelCommand,command);
    },message=>{this.error=message;if(!main.isDestroyed())main.webContents.send(IPC_CHANNELS.desktopMusicState,this.state());});
    this.wheelReady=this.wheel.configure(this.settings.wheel!).catch(error=>{this.error=error instanceof Error?error.message:'轮盘不可用';});
    ipcMain.handle(IPC_CHANNELS.desktopMusicRead,event=>this.guard.invoke(IPC_CHANNELS.desktopMusicRead,event,()=>this.state()));
    ipcMain.handle(IPC_CHANNELS.desktopMusicSave,(event,value)=>this.guard.invoke(IPC_CHANNELS.desktopMusicSave,event,()=>this.save(desktopMusicSettingsSchema.parse(value))));
    ipcMain.handle(IPC_CHANNELS.desktopLyricsRecover,event=>this.guard.invoke(IPC_CHANNELS.desktopLyricsRecover,event,()=>this.resetLyricsPosition()));
    ipcMain.handle(IPC_CHANNELS.desktopLyricsPublish,(event,value)=>this.guard.invoke(IPC_CHANNELS.desktopLyricsPublish,event,()=>{this.frame=lyricsFrameSchema.parse(value);this.sendFrame();}));
    ipcMain.handle(ACTION,(event,value)=>{
      if(!this.lyrics||!this.lyricGuard||event.sender!==this.lyrics.webContents||event.senderFrame!==event.sender.mainFrame||!LYRICS_ACTIONS.includes(value))throw new Error('LYRICS_ACTION_REJECTED');
      return this.lyricGuard.invoke(ACTION,event,()=>{
        if(['play-pause','next','previous'].includes(value)){if(!main.isDestroyed())main.webContents.send(IPC_CHANNELS.mediaCommand,value);return;}
        if(value==='close'||value==='lock')return this.save({...this.settings,...(value==='close'?{lyricsVisible:false}:{lyricsLocked:true})});
        const style={...this.settings.lyricsStyle!};
        if(value==='font-smaller')style.fontSize=Math.max(22,style.fontSize-2);
        if(value==='font-larger')style.fontSize=Math.min(48,style.fontSize+2);
        if(value==='toggle-rows')style.rows=style.rows===1?2:1;
        if(value==='color-next'){const colors=['#deefaa','#ffffff','#a5d9ff','#ffd0ad'];style.highlight=colors[(colors.indexOf(style.highlight)+1)%colors.length]!;}
        return this.save({...this.settings,lyricsStyle:style});
      });
    });
    screen.on('display-removed',this.displayChange);screen.on('display-metrics-changed',this.displayChange);
    main.webContents.on('render-process-gone',()=>{this.frame={title:'墨屿',line:'播放器已断开',nextLine:'',status:'请重新打开主窗口'};this.sendFrame();});
    this.updateWindow();
  }
  state():DesktopMusicState{return {settings:structuredClone(this.settings),error:this.error};}
  async toggleLyrics(){const state=await this.save({...this.settings,lyricsVisible:!this.settings.lyricsVisible});if(state.settings.lyricsVisible)this.bringLyricsToMainDisplay();return state;}
  unlockLyrics(){return this.save({...this.settings,lyricsLocked:false,lyricsVisible:true});}
  async resetLyricsPosition(){await this.save({...this.settings,lyricsVisible:true});this.bringLyricsToMainDisplay();}
  private bringLyricsToMainDisplay(){if(this.lyrics&&!this.lyrics.isDestroyed()&&!this.main.isDestroyed()){const area=screen.getDisplayMatching(this.main.getBounds()).workArea;this.lyrics.setBounds(this.bounds({x:area.x+(area.width-Math.min(920,area.width))/2,y:area.y+area.height-Math.min(220,area.height)-40}));this.lyrics.showInactive();}}
  private reportLyricsError(message:string){this.error=message;if(!this.main.isDestroyed())this.main.webContents.send(IPC_CHANNELS.desktopMusicState,this.state());}
  private async save(input:DesktopMusicSettings){
    const settings=desktopMusicSettingsSchema.parse({...input,shortcutsEnabled:false}),previous=this.settings;
    const wheelChanged=JSON.stringify(previous.wheel)!==JSON.stringify(settings.wheel);
    if(this.saving)throw new Error('桌面音乐设置正在保存，请稍后重试。');this.saving=true;
    let wheelApplied=false,storageStarted=false;
    try{await this.wheelReady;
      if(wheelChanged){await this.wheel.configure(settings.wheel);wheelApplied=true;}
      storageStarted=true;this.store.setSetting(KEY,settings);
    }catch(error){
      if(wheelApplied){try{await this.wheel.configure(previous.wheel!);}catch{
        const message='设置未保存，且原轮盘配置恢复失败，请在客户端设置中重新启用轮盘。';
        this.reportLyricsError(message);throw new Error(message);
      }}
      const reason=error instanceof Error&&/^(轮盘|快捷键)/.test(error.message)?error.message.slice(0,200):'轮盘配置未完成，原设置未改变。';
      const message=storageStarted?'本机设置保存失败，原设置未改变，请重试。':reason;
      this.reportLyricsError(message);throw new Error(message);
    }finally{this.saving=false;}
    this.settings=settings;this.error=undefined;
    try{this.updateWindow();}catch{this.reportLyricsError('设置已保存，但桌面歌词窗口无法显示，请重新打开歌词。');}
    const state=this.state();if(!this.main.isDestroyed())this.main.webContents.send(IPC_CHANNELS.desktopMusicState,state);return state;
  }
  private bounds(saved?:Partial<Rectangle>):Rectangle{
    const displays=screen.getAllDisplays().map(display=>display.workArea),primary=screen.getPrimaryDisplay().workArea;
    const area=displays.find(area=>Number.isFinite(saved?.x)&&Number.isFinite(saved?.y)&&saved!.x!>=area.x&&saved!.x!<area.x+area.width&&saved!.y!>=area.y&&saved!.y!<area.y+area.height)||primary;
    const width=Math.min(920,area.width),height=Math.min(220,area.height);
    return {width,height,x:Math.round(Math.min(area.x+area.width-width,Math.max(area.x,Number.isFinite(saved?.x)?saved!.x!:area.x+(area.width-width)/2))),y:Math.round(Math.min(area.y+area.height-height,Math.max(area.y,Number.isFinite(saved?.y)?saved!.y!:area.y+area.height-height-40)))};
  }
  private updateWindow(){
    if(!this.settings.lyricsVisible){this.lyrics?.hide();return;}
    if(!this.lyrics||this.lyrics.isDestroyed()){
      const window=new BrowserWindow({...this.bounds(this.store.getSetting('music.lyrics-position-v1')),show:false,frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:join(app.getAppPath(),'dist/preload/lyrics.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,partition:'moyu-lyrics-isolated'}});
      this.lyricGuard=new IpcGuard(window.webContents.id);
      this.lyrics=window;window.removeMenu();window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
      window.once('ready-to-show',()=>{this.sendFrame();if(this.settings.lyricsVisible)window.showInactive();});
      window.on('move',()=>{clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{if(!window.isDestroyed())this.store.setSetting('music.lyrics-position-v1',window.getBounds());},250);});
      window.on('close',event=>{event.preventDefault();void this.save({...this.settings,lyricsVisible:false}).catch(()=>{});});
      window.webContents.on('render-process-gone',()=>{if(this.lyrics!==window)return;this.lyrics=undefined;this.lyricGuard=undefined;window.destroy();this.reportLyricsError('桌面歌词显示已中断，请重新打开桌面歌词。');});
      void window.loadFile(join(app.getAppPath(),'dist/renderer/lyrics.html')).catch(()=>{if(this.lyrics!==window||window.isDestroyed())return;this.lyrics=undefined;this.lyricGuard=undefined;window.destroy();this.reportLyricsError('桌面歌词窗口加载失败，请重新打开桌面歌词。');});
    }
    this.lyrics.setIgnoreMouseEvents(this.settings.lyricsLocked,{forward:true});this.lyrics.setMovable(!this.settings.lyricsLocked);this.lyrics.showInactive();this.sendFrame();
  }
  private sendFrame(){if(this.lyrics&&!this.lyrics.isDestroyed())this.lyrics.webContents.send(FRAME,{...this.frame,locked:this.settings.lyricsLocked,style:this.settings.lyricsStyle});}
  dispose(){clearTimeout(this.saveTimer);this.wheel.dispose();for(const channel of [IPC_CHANNELS.desktopMusicRead,IPC_CHANNELS.desktopMusicSave,IPC_CHANNELS.desktopLyricsRecover,IPC_CHANNELS.desktopLyricsPublish,ACTION])ipcMain.removeHandler(channel);screen.removeListener('display-removed',this.displayChange);screen.removeListener('display-metrics-changed',this.displayChange);this.lyrics?.destroy();}
}
