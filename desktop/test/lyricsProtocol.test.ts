import {describe,it,expect} from 'vitest';
import {desktopMusicSettingsSchema,DEFAULT_DESKTOP_MUSIC} from '../src/main/music/shortcuts';
import {lyricsFrameSchema} from '../src/main/music/lyricsProtocol';
const base={title:'合成曲目',line:'你好',nextLine:'',status:'播放中'};
describe('desktop lyric trust boundary',()=>{
  it('migrates existing settings without losing shortcuts or lock state',()=>{
    const {lyricsStyle,wheel,...old}=DEFAULT_DESKTOP_MUSIC;
    const saved={...old,lyricsLocked:true,shortcuts:{...old.shortcuts,next:'Control+Alt+N'}};
    expect(desktopMusicSettingsSchema.parse(saved)).toEqual({...saved,lyricsStyle,wheel});
  });
  it('rejects CSS injection and unbounded style values',()=>{
    for(const style of [{fontSize:1000,highlight:'#ffffff',rows:2},{fontSize:38,highlight:'red;position:fixed',rows:2},{fontSize:38,highlight:'#ffffff',rows:3}])expect(desktopMusicSettingsSchema.safeParse({...DEFAULT_DESKTOP_MUSIC,lyricsStyle:style}).success).toBe(false);
  });
  it('rejects reversed or mismatched timings and oversized frames',()=>{
    for(const words of [[{text:'你好',timeMs:2000,endMs:1000}],[{text:'其他歌词',timeMs:1000}],[{text:'你',timeMs:2000},{text:'好',timeMs:1000}]])expect(lyricsFrameSchema.safeParse({...base,words}).success).toBe(false);
    expect(lyricsFrameSchema.safeParse({...base,line:'a'.repeat(2001)}).success).toBe(false);
    expect(lyricsFrameSchema.safeParse({...base,words:[{text:'你',timeMs:1000,endMs:2000},{text:'好',timeMs:2000}]}).success).toBe(true);
  });
});
