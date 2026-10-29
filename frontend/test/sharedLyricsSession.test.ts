import {describe,it,expect,vi} from 'vitest';
import {SharedLyricsSession,type LyricsIdentity} from '../src/audio/lyrics/sharedLyricsSession';
const identity=(trackId='a',accountEpoch=0,sourceKey='local'):LyricsIdentity=>({trackId,accountEpoch,sourceKey});
const lyrics=(trackId='a',text='One')=>({trackId,content:`[00:01]${text}\n[00:03]Next`,source:'sidecar' as const});
describe('one shared lyrics session',()=>{
  it('deduplicates readers and keeps the remaining consumer after unsubscribe',async()=>{
    const s=new SharedLyricsSession(),first=vi.fn(),second=vi.fn();
    const stop=s.subscribe(first);s.subscribe(second);const load=vi.fn(async()=>lyrics());
    await Promise.all([s.setTrack(identity(),load,async()=>0),s.setTrack(identity(),load,async()=>0)]);
    expect(load).toHaveBeenCalledTimes(1);stop();first.mockClear();s.setPosition(3200);
    expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenLastCalledWith(expect.objectContaining({currentIndex:1}));s.dispose();
  });
  it('rejects late old track and epoch results without restoring private state',async()=>{
    const s=new SharedLyricsSession();let resolve!:(v:ReturnType<typeof lyrics>)=>void;
    const old=s.setTrack(identity(),()=>new Promise(r=>resolve=r),async()=>0);
    await s.setTrack(identity('b',1,'kugou'),async()=>lyrics('b','New'),async()=>0);
    resolve(lyrics());await old;expect(s.snapshot().lines[0]?.text).toBe('New');
    s.invalidate();expect(s.snapshot()).toMatchObject({lines:[],currentIndex:-1});
    expect(s.setOffset(identity('b',1,'kugou'),1000)).toBeUndefined();s.dispose();
  });
  it('offset refresh is identity guarded and never reloads lyrics',async()=>{
    const s=new SharedLyricsSession(),load=vi.fn(async()=>lyrics());await s.setTrack(identity(),load,async()=>500);
    s.setPosition(1300);expect(s.snapshot().currentIndex).toBe(-1);
    s.setOffset(identity(),0);expect(s.snapshot().currentIndex).toBe(0);
    expect(s.setOffset(identity('a',1),9000)).toBeUndefined();expect(load).toHaveBeenCalledTimes(1);s.dispose();
  });
  it('an offset changed while a read is pending wins over the older offset read',async()=>{
    const s=new SharedLyricsSession();let release!:(v:ReturnType<typeof lyrics>)=>void;
    const pending=s.setTrack(identity(),()=>new Promise(r=>release=r),async()=>0);
    s.setPosition(1400);s.setOffset(identity(),1000);release(lyrics());await pending;
    expect(s.snapshot()).toMatchObject({offsetMs:1000,currentIndex:-1});s.dispose();
  });
  it('shares errors, permits explicit retry and disposes hanging loads',async()=>{
    const s=new SharedLyricsSession();await s.setTrack(identity(),async()=>{throw new Error('private path');},async()=>0);
    expect(s.snapshot().error).toBe('歌词读取失败或超时。');
    await s.setTrack(identity(),async()=>lyrics(),async()=>0);expect(s.snapshot().error).toBeUndefined();
    const pending=s.setTrack(identity('b'),()=>new Promise(()=>{}),async()=>0);s.dispose();await pending;
    expect(s.snapshot().lines).toEqual([]);
  });
});
