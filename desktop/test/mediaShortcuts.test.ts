import {describe,it,expect,vi} from 'vitest';
import {DEFAULT_DESKTOP_MUSIC,MediaShortcuts,desktopMusicSettingsSchema} from '../src/main/music/shortcuts';
describe('transactional media shortcuts',()=>{
  it('registers exact commands and updates only owned accelerators',()=>{
    const callbacks=new Map<string,()=>void>(),send=vi.fn();const registry={register:vi.fn((key:string,callback:()=>void)=>{callbacks.set(key,callback);return true;}),unregister:vi.fn()};const shortcuts=new MediaShortcuts(registry,send);
    shortcuts.apply(DEFAULT_DESKTOP_MUSIC,()=>{});callbacks.get('MediaPlayPause')!();expect(send).toHaveBeenCalledWith('play-pause');
    shortcuts.apply({...DEFAULT_DESKTOP_MUSIC,shortcutsEnabled:false},()=>{});expect(registry.unregister).toHaveBeenCalledTimes(3);shortcuts.dispose();expect(registry.unregister).toHaveBeenCalledTimes(3);
  });
  it('conflicting shortcut rolls back additions without removing previous bindings',()=>{
    const registry={register:vi.fn((key:string)=>key!=='Control+Alt+N'),unregister:vi.fn()},send=vi.fn();const shortcuts=new MediaShortcuts(registry,send);shortcuts.apply(DEFAULT_DESKTOP_MUSIC,()=>{});const persist=vi.fn();
    expect(()=>shortcuts.apply({...DEFAULT_DESKTOP_MUSIC,shortcuts:{'play-pause':'Control+Alt+P',next:'Control+Alt+N',previous:'Control+Alt+B'}},persist)).toThrow('已被占用');expect(persist).not.toHaveBeenCalled();expect(registry.unregister).toHaveBeenCalledExactlyOnceWith('Control+Alt+P');
  });
  it('persistence failure preserves old keys and invalid shortcuts are rejected',()=>{
    const registry={register:vi.fn(()=>true),unregister:vi.fn()},shortcuts=new MediaShortcuts(registry,vi.fn());shortcuts.apply(DEFAULT_DESKTOP_MUSIC,()=>{});
    expect(()=>shortcuts.apply({...DEFAULT_DESKTOP_MUSIC,shortcuts:{...DEFAULT_DESKTOP_MUSIC.shortcuts,next:'Control+Alt+N'}},()=>{throw new Error('disk');})).toThrow('disk');expect(registry.unregister).toHaveBeenCalledExactlyOnceWith('Control+Alt+N');
    for(const key of ['Alt+F4','Control+C','x.exe','MediaNextTrack'])expect(desktopMusicSettingsSchema.safeParse({...DEFAULT_DESKTOP_MUSIC,shortcuts:{...DEFAULT_DESKTOP_MUSIC.shortcuts,'play-pause':key}}).success).toBe(false);
  });
});
