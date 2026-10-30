import {app,BrowserWindow,screen} from 'electron';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {join} from 'node:path';
import type {DesktopWheelCommand,DesktopWheelSettings} from '@studyroom/contracts';
import {metadataEnvironment} from '../../audio/library/metadataProcess';
import {nativeArguments,parseWheelMessage,wheelSettingsSchema,wheelSlot} from './wheelProtocol';
export class DesktopWheel {
  private helper?:ChildProcessWithoutNullStreams;private window?:BrowserWindow;private heartbeat?:NodeJS.Timeout;
  private settings?:DesktopWheelSettings;private active=0;private lastSequence=0;private frameSequence=0;private center={x:0,y:0};private ready=false;
  private disposed=false;private pending=new Set<ChildProcessWithoutNullStreams>();private origin={x:0,y:0};private moved=false;
  private recordingUntil=0;
  setRecording(active:boolean){this.cancel();this.recordingUntil=active?Date.now()+30000:0;}
  private displayChanged=()=>this.cancel();
  constructor(private execute:(command:DesktopWheelCommand)=>void,private report:(message:string)=>void){screen.on('display-removed',this.displayChanged);screen.on('display-metrics-changed',this.displayChanged);}
  async configure(input:DesktopWheelSettings){
    if(this.disposed)throw new Error('轮盘服务已关闭。');
    const settings=wheelSettingsSchema.parse(input);
    if(process.platform!=='win32'||!settings.enabled){this.stop();this.settings=settings;return;}
    if(this.helper&&this.settings?.accelerator===settings.accelerator&&this.settings.allowFullscreen===settings.allowFullscreen){this.cancel();await this.ensureWindow();this.settings=settings;return;}
    const helperPath=app.isPackaged?join(process.resourcesPath,'app.asar.unpacked/dist/native/moyu-input.exe'):join(app.getAppPath(),'dist/native/moyu-input.exe');
    const candidate=spawn(helperPath,nativeArguments(settings.accelerator,settings.allowFullscreen),{windowsHide:true,env:metadataEnvironment()});
    this.pending.add(candidate);
    candidate.stdin.on('error',()=>{});candidate.stderr.resume();
    let buffer='',started=false;
    try{await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>{candidate.kill();reject(new Error('轮盘输入服务未就绪，原设置未改变。'));},4000);
      candidate.once('error',()=>{clearTimeout(timeout);reject(new Error('轮盘输入服务无法启动，原设置未改变。'));});
      candidate.once('exit',()=>{clearTimeout(timeout);if(!started)reject(new Error('轮盘快捷键被占用或输入服务退出，原设置未改变。'));if(this.helper===candidate){this.stop();this.report('轮盘输入服务已停止，请在设置中重新启用。');}});
      candidate.stdout.on('data',chunk=>{
        buffer+=String(chunk);if(buffer.length>8192){candidate.kill();return;}
        let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
          if(!started&&line==='READY'){started=true;clearTimeout(timeout);resolve();continue;}
          if(this.helper===candidate)this.handle(line);
        }
      });
    });}catch(error){candidate.kill();throw error;}finally{this.pending.delete(candidate);}
    if(this.disposed){candidate.kill();throw new Error('轮盘服务已关闭。');}
    try{await this.ensureWindow();}catch(error){candidate.kill();throw error;}
    if(this.disposed){candidate.kill();throw new Error('轮盘服务已关闭。');}
    this.stop();this.helper=candidate;this.settings=settings;this.lastSequence=0;this.heartbeat=setInterval(()=>{if(!candidate.killed)candidate.stdin.write('H');},500);candidate.stdin.write('H');
  }
  private async ensureWindow(){
    if(this.window&&!this.window.isDestroyed())return;
    const window=new BrowserWindow({width:480,height:480,show:false,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:false,focusable:false,webPreferences:{preload:join(app.getAppPath(),'dist/preload/wheel.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,partition:'moyu-wheel-isolated'}});
    this.window=window;this.ready=false;window.setIgnoreMouseEvents(true);window.removeMenu();
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));window.webContents.session.setPermissionCheckHandler(()=>false);
    window.webContents.on('render-process-gone',()=>{this.cancel();this.ready=false;window.destroy();if(this.window===window)this.window=undefined;this.report('轮盘显示已中断，请重新启用。');});
    await window.loadFile(join(app.getAppPath(),'dist/renderer/wheel.html'));this.ready=true;
  }
  private handle(line:string){
    if(Date.now()<this.recordingUntil){this.cancel();return;}
    const event=parseWheelMessage(line);if(!event||!this.settings||!this.ready||!this.window||this.window.isDestroyed())return;
    if(event.type==='OPEN'){
      if(event.sequence<=this.lastSequence)return;this.lastSequence=event.sequence;this.active=event.sequence;this.frameSequence++;
      const point=screen.screenToDipPoint({x:event.x,y:event.y}),area=screen.getDisplayNearestPoint(point).workArea;
      this.origin=point;this.moved=false;
      const x=Math.round(Math.max(area.x,Math.min(area.x+area.width-480,point.x-240))),y=Math.round(Math.max(area.y,Math.min(area.y+area.height-480,point.y-240)));
      this.center={x:x+240,y:y+240};this.window.setBounds({x,y,width:480,height:480});this.frame(-1);this.window.showInactive();return;
    }
    if(event.sequence!==this.active)return;
    if(event.type==='CANCEL'){this.cancel();return;}
    const point=screen.screenToDipPoint({x:event.x,y:event.y});this.moved ||= Math.hypot(point.x-this.origin.x,point.y-this.origin.y)>=8;
    const slot=this.moved?wheelSlot(point.x-this.center.x,point.y-this.center.y):-1;
    if(event.type==='MOVE')this.frame(slot);
    if(event.type==='RELEASE'){const command=slot<0?undefined:this.settings.slots[slot];this.cancel();if(command)this.execute(command);}
  }
  private frame(selected:number){this.window?.webContents.send('desktop-wheel:frame',{sequence:this.frameSequence,selected,slots:this.settings?.slots});}
  cancel(){this.active=0;if(this.window&&!this.window.isDestroyed())this.window.hide();}
  private stop(){this.cancel();clearInterval(this.heartbeat);const helper=this.helper;this.helper=undefined;helper?.stdin.end();helper?.kill();}
  dispose(){this.disposed=true;for(const child of this.pending)child.kill();this.pending.clear();this.stop();this.window?.destroy();this.window=undefined;this.ready=false;screen.removeListener('display-removed',this.displayChanged);screen.removeListener('display-metrics-changed',this.displayChanged);}
}
