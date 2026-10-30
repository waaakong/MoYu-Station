import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_DESKTOP_MUSIC} from '../src/main/music/shortcuts';
const mock=vi.hoisted(()=>({windows:[] as any[],execute:undefined as undefined|((command:string)=>void),configure:vi.fn(async()=>{}),handlers:new Map<string,Function>(),load:vi.fn(async()=>{}),recording:vi.fn(),mediaRegister:vi.fn(()=>true)}));
vi.mock('electron',()=>({app:{getAppPath:()=>'/app'},globalShortcut:{register:mock.mediaRegister,unregister:()=>{}},ipcMain:{handle:(key:string,fn:Function)=>mock.handlers.set(key,fn),removeHandler:(key:string)=>mock.handlers.delete(key)},screen:{getAllDisplays:()=>[{workArea:{x:-1920,y:0,width:1920,height:1080}},{workArea:{x:0,y:0,width:1440,height:900}}],getDisplayMatching:()=>({workArea:{x:0,y:0,width:1440,height:900}}),getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1440,height:900}}),on:()=>{},removeListener:()=>{}},BrowserWindow:class{
  destroyed=false;events=new Map<string,Function>();bounds:any;webEvents=new Map<string,Function>();
  webContents={id:2,send:vi.fn(),setWindowOpenHandler:()=>{},on:(key:string,fn:Function)=>this.webEvents.set(key,fn),session:{setPermissionRequestHandler:()=>{},setPermissionCheckHandler:()=>{}}};
  constructor(options:any){this.bounds=options;mock.windows.push(this);}
  isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}hide=vi.fn();showInactive=vi.fn();isMinimized=vi.fn(()=>false);restore=vi.fn();setAlwaysOnTop=vi.fn();moveTop=vi.fn();setBounds(value:any){this.bounds=value;}getBounds(){return this.bounds;}setIgnoreMouseEvents(){}setMovable(){}removeMenu(){}once(key:string,fn:Function){this.events.set(key,fn);}on(key:string,fn:Function){this.events.set(key,fn);}loadFile(){return mock.load();}
}}));
vi.mock('../src/main/music/desktopWheel',()=>({DesktopWheel:class{constructor(execute:any){mock.execute=execute;}configure=mock.configure;setRecording=mock.recording;dispose(){}}}));
import {DesktopMusic} from '../src/main/music/desktopMusic';
import {IPC_CHANNELS} from '@studyroom/contracts';
describe('native desktop lyrics recovery',()=>{
  beforeEach(()=>{mock.windows=[];mock.handlers.clear();mock.mediaRegister.mockClear();mock.configure.mockReset().mockResolvedValue(undefined);mock.load.mockReset().mockResolvedValue(undefined);});
  function setup(saved?:unknown){const send=vi.fn(),store={getSetting:vi.fn((key:string):unknown=>key==='music.desktop-v1'?saved:undefined),setSetting:vi.fn()},events=new Map<string,Function>(),main={events,on:(name:string,fn:Function)=>events.set(name,fn),removeListener:(name:string)=>events.delete(name),focus:vi.fn(),moveTop:vi.fn(),show:vi.fn(),restore:vi.fn(),isMinimized:vi.fn(()=>false),isVisible:vi.fn(()=>true),isFocused:vi.fn(()=>true),webContents:{id:1,send,focus:vi.fn(),on:()=>{}},isDestroyed:vi.fn(()=>false),getBounds:()=>({x:0,y:0,width:1440,height:900})};return {music:new DesktopMusic(main as any,store as any),send,store,main};}
  it.each(['sound','space','focus'])('wheel %s restores and raises the main window and focuses its page',async command=>{
    const {music,main,send}=setup();main.isMinimized.mockReturnValueOnce(true);
    mock.execute!(command);
    expect(main.restore).toHaveBeenCalledOnce();expect(main.show).toHaveBeenCalledOnce();
    expect(main.moveTop).toHaveBeenCalledOnce();expect(main.focus).toHaveBeenCalledOnce();expect(main.webContents.focus).toHaveBeenCalledOnce();
    expect(main.show.mock.invocationCallOrder[0]).toBeLessThan(main.moveTop.mock.invocationCallOrder[0]);
    expect(main.focus.mock.invocationCallOrder[0]).toBeLessThan(main.webContents.focus.mock.invocationCallOrder[0]);
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopWheelCommand,command);music.dispose();
  });
  it.each(['play-pause','next','previous','mute'])('wheel %s keeps background playback controls from stealing focus',command=>{
    const {music,main}=setup();mock.execute!(command);
    expect(main.show).not.toHaveBeenCalled();expect(main.moveTop).not.toHaveBeenCalled();expect(main.focus).not.toHaveBeenCalled();expect(main.webContents.focus).not.toHaveBeenCalled();music.dispose();
  });
  it('reconciles a delayed activation only once and cancels a disposed request',async()=>{
    const {music,main}=setup();main.isFocused.mockReturnValue(false);mock.execute!('sound');
    await new Promise(resolve=>setImmediate(resolve));expect(main.focus).toHaveBeenCalledTimes(2);
    await new Promise(resolve=>setImmediate(resolve));expect(main.focus).toHaveBeenCalledTimes(2);
    mock.execute!('space');music.dispose();await new Promise(resolve=>setImmediate(resolve));expect(main.focus).toHaveBeenCalledTimes(3);
  });
  it('does not reopen a window minimized again before the focus reconciliation',async()=>{
    const {music,main}=setup();main.isFocused.mockReturnValue(false);mock.execute!('sound');main.isMinimized.mockReturnValue(true);
    await new Promise(resolve=>setImmediate(resolve));expect(main.focus).toHaveBeenCalledOnce();expect(main.restore).not.toHaveBeenCalled();music.dispose();
  });
  it('does not act on a destroyed main window',()=>{
    const {music,main,send}=setup();main.isDestroyed.mockReturnValue(true);send.mockClear();mock.execute!('space');
    expect(main.show).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();music.dispose();
  });
  it('preserves a saved custom chord and never registers legacy global media keys',async()=>{
    const {music}=setup({...DEFAULT_DESKTOP_MUSIC,shortcutsEnabled:true,wheel:{...DEFAULT_DESKTOP_MUSIC.wheel,accelerator:'Control+Alt+Space'}});
    await Promise.resolve();
    expect(mock.configure).toHaveBeenCalledWith(expect.objectContaining({accelerator:'Control+Alt+Space'}));
    expect(mock.mediaRegister).not.toHaveBeenCalled();
    await (music as any).save({...music.state().settings,shortcutsEnabled:true});
    expect(mock.mediaRegister).not.toHaveBeenCalled();expect(music.state().settings.shortcutsEnabled).toBe(false);music.dispose();
  });
  it('only the main frame can temporarily suspend the wheel recorder with a boolean',async()=>{
    const {music}=setup();const recording=mock.handlers.get(IPC_CHANNELS.desktopWheelRecording)!;
    const frame={},sender={id:1,mainFrame:frame};
    await expect(recording({sender,senderFrame:{}},true)).rejects.toThrow('IPC_SENDER_REJECTED');
    await expect(recording({sender,senderFrame:frame},'true')).rejects.toThrow();
    await recording({sender,senderFrame:frame},true);expect(mock.recording).toHaveBeenCalledWith(true);
    await recording({sender,senderFrame:frame},false);expect(mock.recording).toHaveBeenCalledWith(false);
    music.dispose();expect(mock.handlers.has(IPC_CHANNELS.desktopWheelRecording)).toBe(false);
  });
  it('wheel creates a real window and persists visibility',async()=>{const {music,store}=setup();mock.execute!('lyrics');await vi.waitFor(()=>expect(mock.windows).toHaveLength(1));expect(music.state().settings.lyricsVisible).toBe(true);expect(store.setSetting).toHaveBeenCalledWith('music.desktop-v1',expect.objectContaining({lyricsVisible:true}));music.dispose();});
  it('wheel persistence failure reports an error without pretending lyrics are enabled',async()=>{const {music,store,send}=setup();store.setSetting.mockImplementation(()=>{throw new Error('private database path');});mock.execute!('lyrics');await vi.waitFor(()=>expect(music.state().error).toBeTruthy());expect(music.state().settings.lyricsVisible).toBe(false);expect(mock.windows).toHaveLength(0);expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopMusicState,expect.objectContaining({error:expect.not.stringContaining('private database path')}));music.dispose();});
  it('finite recovery IPC accepts only the main frame and is removed on dispose',async()=>{
    const {music}=setup();const recover=mock.handlers.get(IPC_CHANNELS.desktopLyricsRecover)!;
    const frame={},sender={id:1,mainFrame:frame};
    await expect(recover({sender:{id:9,mainFrame:frame},senderFrame:frame})).rejects.toThrow('IPC_SENDER_REJECTED');
    await expect(recover({sender,senderFrame:{}})).rejects.toThrow('IPC_SENDER_REJECTED');
    expect(mock.windows).toHaveLength(0);await recover({sender,senderFrame:frame});
    expect(music.state().settings.lyricsVisible).toBe(true);expect(mock.windows).toHaveLength(1);
    music.dispose();expect(mock.handlers.has(IPC_CHANNELS.desktopLyricsRecover)).toBe(false);
  });
  it('tray recovery waits for the first frame and uses current screen bounds',async()=>{const {music}=setup();await music.resetLyricsPosition();expect(mock.windows[0].bounds).toEqual({x:260,y:640,width:920,height:220});expect(mock.windows[0].showInactive).not.toHaveBeenCalled();mock.windows[0].events.get('ready-to-show')!();expect(mock.windows[0].showInactive).toHaveBeenCalled();expect(mock.windows[0].moveTop).toHaveBeenCalled();expect(music.state().settings.lyricsVisible).toBe(true);music.dispose();});
  it('recovery replaces an alive but invisible surface and ignores its late readiness callback',async()=>{
    const saved={...DEFAULT_DESKTOP_MUSIC,lyricsVisible:true,lyricsLocked:true,lyricsStyle:{...DEFAULT_DESKTOP_MUSIC.lyricsStyle,highlight:'#abcdef'}};
    const {music}=setup(saved);const old=mock.windows[0];old.events.get('ready-to-show')!();old.showInactive.mockClear();
    await music.resetLyricsPosition();const fresh=mock.windows[1];expect(old.destroyed).toBe(true);expect(fresh.destroyed).toBe(false);
    old.events.get('ready-to-show')!();expect(old.showInactive).not.toHaveBeenCalled();expect(fresh.showInactive).not.toHaveBeenCalled();
    fresh.events.get('ready-to-show')!();expect(fresh.showInactive).toHaveBeenCalled();expect(fresh.setAlwaysOnTop).toHaveBeenCalledWith(true,'screen-saver');
    expect(music.state().settings).toMatchObject({lyricsVisible:true,lyricsLocked:true,lyricsStyle:{highlight:'#abcdef'}});music.dispose();
  });
  it('failed recovery persistence keeps the original window and settings',async()=>{
    const {music,store}=setup({...DEFAULT_DESKTOP_MUSIC,lyricsVisible:true});const original=mock.windows[0];
    store.setSetting.mockImplementation(()=>{throw new Error('private path');});await expect(music.resetLyricsPosition()).rejects.toThrow('本机设置保存失败');
    expect(original.destroyed).toBe(false);expect(mock.windows).toHaveLength(1);expect(music.state().settings.lyricsVisible).toBe(true);music.dispose();
  });
  it('reasserts topmost after main-window switching and demotion without calling focus',async()=>{
    const {music,main}=setup({...DEFAULT_DESKTOP_MUSIC,lyricsVisible:true});const window=mock.windows[0];window.events.get('ready-to-show')!();
    window.setAlwaysOnTop.mockClear();main.events.get('blur')!();await vi.waitFor(()=>expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true,'screen-saver'));
    window.setAlwaysOnTop.mockClear();window.events.get('always-on-top-changed')!({},false);await vi.waitFor(()=>expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true,'screen-saver'));
    expect(main.focus).not.toHaveBeenCalled();music.dispose();expect(main.events.size).toBe(0);
  });
  it('does not resurrect disabled lyrics from delayed window events',async()=>{
    const {music,main}=setup({...DEFAULT_DESKTOP_MUSIC,lyricsVisible:true});const window=mock.windows[0];window.events.get('ready-to-show')!();
    main.events.get('minimize')!();await (music as any).save({...music.state().settings,lyricsVisible:false});window.showInactive.mockClear();
    await new Promise(resolve=>setTimeout(resolve,0));expect(window.showInactive).not.toHaveBeenCalled();music.dispose();
  });
  it('wheel opening brings lyrics back from another connected display',async()=>{const {music,store}=setup();store.getSetting.mockReturnValue({x:-1486,y:602,width:920,height:220});await music.toggleLyrics();expect(mock.windows[0].bounds).toEqual({x:260,y:640,width:920,height:220});music.dispose();});
  it('failed renderer loads can be recreated rather than reusing a blank window',async()=>{mock.load.mockRejectedValueOnce(new Error('load failed'));const {music}=setup();await music.resetLyricsPosition();await vi.waitFor(()=>expect(mock.windows[0].destroyed).toBe(true));expect(music.state().error).toContain('加载失败');await music.resetLyricsPosition();expect(mock.windows).toHaveLength(2);expect(mock.windows[1].destroyed).toBe(false);music.dispose();});
  it('renderer termination reports failure and permits recovery',async()=>{const {music}=setup();await music.resetLyricsPosition();mock.windows[0].webEvents.get('render-process-gone')!();expect(music.state().error).toContain('已中断');await music.resetLyricsPosition();expect(mock.windows).toHaveLength(2);expect(music.state().error).toBeUndefined();music.dispose();});
  it('changing lyrics never reconfigures the input hook',async()=>{
    const {music}=setup();await Promise.resolve();mock.configure.mockClear();
    await (music as any).save({...music.state().settings,lyricsStyle:{...music.state().settings.lyricsStyle,base:'#abcdef'}});
    expect(mock.configure).not.toHaveBeenCalled();expect(music.state().settings.lyricsStyle?.base).toBe('#abcdef');music.dispose();
  });
  it('registration failure preserves settings and does not persist the new chord',async()=>{
    const {music,store}=setup();await Promise.resolve();mock.configure.mockClear();
    mock.configure.mockRejectedValueOnce(new Error('轮盘快捷键被占用，原设置未改变。'));
    const original=music.state().settings;
    await expect((music as any).save({...original,wheel:{...original.wheel,accelerator:'Control+Alt+K'}})).rejects.toThrow('被占用');
    expect(music.state().settings).toEqual(original);expect(store.setSetting).not.toHaveBeenCalled();music.dispose();
  });
  it('storage failure restores the former hook and sanitizes the returned error',async()=>{
    const {music,store}=setup();await Promise.resolve();mock.configure.mockClear();
    const original=music.state().settings;store.setSetting.mockImplementation(()=>{throw new Error('private database path');});
    await expect((music as any).save({...original,wheel:{...original.wheel,accelerator:'Control+Alt+K'}})).rejects.toThrow('本机设置保存失败');
    expect(mock.configure).toHaveBeenCalledTimes(2);expect(mock.configure).toHaveBeenLastCalledWith(original.wheel);
    expect(music.state().settings).toEqual(original);expect(music.state().error).not.toContain('private');music.dispose();
  });
  it('reports rollback failure separately instead of claiming the previous binding works',async()=>{
    const {music,store}=setup();await Promise.resolve();mock.configure.mockClear();
    mock.configure.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('restore failed'));
    store.setSetting.mockImplementation(()=>{throw new Error('disk');});
    const original=music.state().settings;
    await expect((music as any).save({...original,wheel:{...original.wheel,accelerator:'Control+Alt+K'}})).rejects.toThrow('恢复失败');
    expect(music.state().settings).toEqual(original);music.dispose();
  });
});


