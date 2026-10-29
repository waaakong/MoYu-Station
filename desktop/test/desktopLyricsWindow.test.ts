import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_DESKTOP_MUSIC} from '../src/main/music/shortcuts';
const mock=vi.hoisted(()=>({windows:[] as any[],execute:undefined as undefined|((command:string)=>void),configure:vi.fn(async()=>{}),handlers:new Map<string,Function>(),load:vi.fn(async()=>{}),mediaRegister:vi.fn(()=>true)}));
vi.mock('electron',()=>({app:{getAppPath:()=>'/app'},globalShortcut:{register:mock.mediaRegister,unregister:()=>{}},ipcMain:{handle:(key:string,fn:Function)=>mock.handlers.set(key,fn),removeHandler:(key:string)=>mock.handlers.delete(key)},screen:{getAllDisplays:()=>[{workArea:{x:-1920,y:0,width:1920,height:1080}},{workArea:{x:0,y:0,width:1440,height:900}}],getDisplayMatching:()=>({workArea:{x:0,y:0,width:1440,height:900}}),getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1440,height:900}}),on:()=>{},removeListener:()=>{}},BrowserWindow:class{
  destroyed=false;events=new Map<string,Function>();bounds:any;webEvents=new Map<string,Function>();
  webContents={id:2,send:vi.fn(),setWindowOpenHandler:()=>{},on:(key:string,fn:Function)=>this.webEvents.set(key,fn),session:{setPermissionRequestHandler:()=>{},setPermissionCheckHandler:()=>{}}};
  constructor(options:any){this.bounds=options;mock.windows.push(this);}
  isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}hide=vi.fn();showInactive=vi.fn();setBounds(value:any){this.bounds=value;}getBounds(){return this.bounds;}setIgnoreMouseEvents(){}setMovable(){}removeMenu(){}once(key:string,fn:Function){this.events.set(key,fn);}on(key:string,fn:Function){this.events.set(key,fn);}loadFile(){return mock.load();}
}}));
vi.mock('../src/main/music/desktopWheel',()=>({DesktopWheel:class{constructor(execute:any){mock.execute=execute;}configure=mock.configure;dispose(){}}}));
import {DesktopMusic} from '../src/main/music/desktopMusic';
import {IPC_CHANNELS} from '@studyroom/contracts';
describe('native desktop lyrics recovery',()=>{
  beforeEach(()=>{mock.windows=[];mock.handlers.clear();mock.mediaRegister.mockClear();mock.configure.mockReset().mockResolvedValue(undefined);mock.load.mockReset().mockResolvedValue(undefined);});
  function setup(saved?:unknown){const send=vi.fn(),store={getSetting:vi.fn((key:string):unknown=>key==='music.desktop-v1'?saved:undefined),setSetting:vi.fn()},main={webContents:{id:1,send,on:()=>{}},isDestroyed:()=>false,getBounds:()=>({x:0,y:0,width:1440,height:900})};return {music:new DesktopMusic(main as any,store as any),send,store};}
  it('preserves a saved custom chord and never registers legacy global media keys',async()=>{
    const {music}=setup({...DEFAULT_DESKTOP_MUSIC,shortcutsEnabled:true,wheel:{...DEFAULT_DESKTOP_MUSIC.wheel,accelerator:'Control+Alt+Space'}});
    await Promise.resolve();
    expect(mock.configure).toHaveBeenCalledWith(expect.objectContaining({accelerator:'Control+Alt+Space'}));
    expect(mock.mediaRegister).not.toHaveBeenCalled();
    await (music as any).save({...music.state().settings,shortcutsEnabled:true});
    expect(mock.mediaRegister).not.toHaveBeenCalled();expect(music.state().settings.shortcutsEnabled).toBe(false);music.dispose();
  });
  it('wheel creates a real window and persists visibility',async()=>{const {music,store}=setup();mock.execute!('lyrics');await vi.waitFor(()=>expect(mock.windows).toHaveLength(1));expect(music.state().settings.lyricsVisible).toBe(true);expect(store.setSetting).toHaveBeenCalledWith('music.desktop-v1',expect.objectContaining({lyricsVisible:true}));music.dispose();});
  it('wheel persistence failure reports an error without pretending lyrics are enabled',async()=>{const {music,store,send}=setup();store.setSetting.mockImplementation(()=>{throw new Error('private database path');});mock.execute!('lyrics');await vi.waitFor(()=>expect(music.state().error).toBeTruthy());expect(music.state().settings.lyricsVisible).toBe(false);expect(mock.windows).toHaveLength(0);expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopMusicState,expect.objectContaining({error:expect.not.stringContaining('private database path')}));music.dispose();});
  it('tray recovery creates a hidden/missing window in current screen bounds',async()=>{const {music}=setup();await music.resetLyricsPosition();expect(mock.windows[0].bounds).toEqual({x:260,y:640,width:920,height:220});expect(mock.windows[0].showInactive).toHaveBeenCalled();expect(music.state().settings.lyricsVisible).toBe(true);music.dispose();});
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


