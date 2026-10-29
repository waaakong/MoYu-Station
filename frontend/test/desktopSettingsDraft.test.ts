import {describe,it,expect,vi} from 'vitest';
import {DesktopSettingsDraft} from '../src/audio/lyrics/desktopSettingsDraft';
import type {DesktopMusicSettings} from '@studyroom/contracts';
const settings=():DesktopMusicSettings=>({shortcutsEnabled:false,shortcuts:{'play-pause':'MediaPlayPause',next:'MediaNextTrack',previous:'MediaPreviousTrack'},lyricsVisible:false,lyricsLocked:false,lyricsStyle:{fontSize:38,highlight:'#deefaa',rows:2}});
describe('desktop settings draft isolation',()=>{
  it('preserves edited fields while receiving unrelated external changes',()=>{
    const editor=new DesktopSettingsDraft();editor.receive(settings());editor.draft!.lyricsStyle!.fontSize=44;
    editor.receive({...settings(),lyricsLocked:true});
    expect(editor.draft!.lyricsStyle!.fontSize).toBe(44);expect(editor.draft!.lyricsLocked).toBe(true);expect(editor.dirty).toBe(true);
  });
  it('does not let a late save response replace edits made during that save',async()=>{
    const editor=new DesktopSettingsDraft();editor.receive(settings());editor.draft!.lyricsStyle!.fontSize=40;
    let finish!:(value:DesktopMusicSettings)=>void;
    const pending=editor.save(()=>new Promise(resolve=>finish=resolve));
    editor.draft!.lyricsStyle!.fontSize=46;editor.receive(settings());
    finish({...settings(),lyricsStyle:{...settings().lyricsStyle!,fontSize:40}});await pending;
    expect(editor.draft!.lyricsStyle!.fontSize).toBe(46);expect(editor.dirty).toBe(true);
  });
  it('preserves the draft after failure and rejects overlapping saves',async()=>{
    const editor=new DesktopSettingsDraft();editor.receive(settings());editor.draft!.lyricsLocked=true;
    let fail!:(error:Error)=>void;const persist=vi.fn(()=>new Promise<DesktopMusicSettings>((_,reject)=>fail=reject));
    const pending=editor.save(persist);expect(await editor.save(persist)).toBe(false);expect(persist).toHaveBeenCalledOnce();
    fail(new Error('保存失败'));expect(await pending).toBe(false);expect(editor.error).toBe('保存失败');expect(editor.draft!.lyricsLocked).toBe(true);expect(editor.dirty).toBe(true);
  });
  it('ignores a response delivered after the editor is disposed',async()=>{
    const editor=new DesktopSettingsDraft();editor.receive(settings());let finish!:(value:DesktopMusicSettings)=>void;
    const pending=editor.save(()=>new Promise(resolve=>finish=resolve));editor.dispose();finish({...settings(),lyricsLocked:true});
    expect(await pending).toBe(false);expect(editor.draft!.lyricsLocked).toBe(false);
  });
});
