import {describe,it,expect} from 'vitest';
import {DEFAULT_DESKTOP_MUSIC,desktopMusicSettingsSchema,readDesktopMusicSettings} from '../src/main/music/shortcuts';

describe('compatible desktop music settings',()=>{
  it('adds bounded style defaults without losing an existing custom chord',()=>{
    const saved={...DEFAULT_DESKTOP_MUSIC,shortcutsEnabled:true,lyricsLocked:true,
      lyricsStyle:{fontSize:38,highlight:'#abcdef',rows:2},
      wheel:{...DEFAULT_DESKTOP_MUSIC.wheel!,accelerator:'Control+Alt+Space'}};
    const restored=readDesktopMusicSettings(saved);
    expect(restored.lyricsStyle).toEqual({fontSize:38,highlight:'#abcdef',rows:2,base:'#aab7a3',fontFamily:'system',opacity:.85,smoothScroll:true});
    expect(restored.wheel?.accelerator).toBe('Control+Alt+Space');
    expect(restored.lyricsLocked).toBe(true);
    expect(restored.shortcutsEnabled).toBe(false);
    expect(restored.shortcuts).toEqual(saved.shortcuts);
  });
  it('rejects arbitrary CSS, invalid font families and opacity outside bounds',()=>{
    for(const extra of [{base:'red;position:fixed'},{base:'#abcd'},{fontFamily:'url(https://invalid)'},{opacity:-.1},{opacity:1.1},{opacity:NaN}]){
      expect(desktopMusicSettingsSchema.safeParse({...DEFAULT_DESKTOP_MUSIC,lyricsStyle:{...DEFAULT_DESKTOP_MUSIC.lyricsStyle,...extra}}).success).toBe(false);
    }
    for(const opacity of [0,1])expect(desktopMusicSettingsSchema.safeParse({...DEFAULT_DESKTOP_MUSIC,lyricsStyle:{...DEFAULT_DESKTOP_MUSIC.lyricsStyle,opacity}}).success).toBe(true);
  });
  it('uses independent defaults without rewriting a saved shortcut preference',()=>{
    const first=readDesktopMusicSettings(undefined),second=readDesktopMusicSettings(undefined);
    first.wheel!.accelerator='Control+Alt+K';
    expect(second.wheel!.accelerator).toBe('Control+Alt');
    expect(second.shortcutsEnabled).toBe(false);
  });
});
