import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {reactive,nextTick} from 'vue';
import type {DesktopLyricsFrame} from '@studyroom/contracts';
const stores=vi.hoisted(()=>({player:undefined as any,providers:undefined as any}));
vi.mock('../src/stores/player',()=>({usePlayerStore:()=>stores.player}));
vi.mock('../src/stores/providers',()=>({useProvidersStore:()=>stores.providers}));
import {startSharedLyricsSession,sharedLyricsState,sharedLyricsControls,saveSharedLyricsOffset,lyricsStageClock} from '../src/audio/lyrics/sharedLyricsRuntime';
import {startDesktopLyrics,desktopMusicState} from '../src/audio/lyrics/desktopLyrics';
let stop:()=>void,stopDesktop:(()=>void)|undefined;
const bridge={getTrackLyrics:vi.fn(),getTrackLyricOffset:vi.fn(),saveTrackLyricOffset:vi.fn(),getDesktopMusic:vi.fn(),onDesktopMusicState:vi.fn(()=>()=>{}),publishDesktopLyrics:vi.fn(async(_frame:DesktopLyricsFrame)=>{})};
const settle=async()=>{for(let i=0;i<15;i++){await Promise.resolve();await nextTick();}};
beforeEach(()=>{
  vi.clearAllMocks();stores.player=reactive({currentItem:{track:{id:'a',title:'Synthetic',source:{kind:'local',fileToken:'synthetic-token'}}},playback:{positionMs:1500,status:'playing'},buffering:false});
  stores.providers=reactive({identityEpoch:0});
  bridge.getTrackLyrics.mockImplementation(async({trackId})=>({trackId,content:'[00:01]One\n[00:03]Next',source:'sidecar'}));
  bridge.getTrackLyricOffset.mockResolvedValue({offsetMs:500});bridge.saveTrackLyricOffset.mockResolvedValue(undefined);
  bridge.getDesktopMusic.mockResolvedValue({settings:{lyricsVisible:true}});
  desktopMusicState.state=null;
  vi.stubGlobal('window',Object.assign(new EventTarget(),{studyRoomDesktop:bridge}));
  stop=startSharedLyricsSession();
});
afterEach(()=>{stopDesktop?.();stopDesktop=undefined;stop();vi.unstubAllGlobals();});
describe('application-owned shared lyrics wiring',()=>{
  it('publisher shares one read, applies offset once and survives another consumer leaving',async()=>{
    stopDesktop=startDesktopLyrics();await settle();
    expect(bridge.getTrackLyrics).toHaveBeenCalledTimes(1);expect(sharedLyricsState.currentIndex).toBe(0);
    expect(bridge.publishDesktopLyrics).toHaveBeenLastCalledWith(expect.objectContaining({line:'One',positionMs:1000}));
    expect(bridge.publishDesktopLyrics.mock.calls.at(-1)?.[0]?.trackKey).not.toContain('synthetic-token');
    await saveSharedLyricsOffset(500);await settle();
    expect(sharedLyricsState.offsetMs).toBe(1000);expect(sharedLyricsState.currentIndex).toBe(-1);
    expect(bridge.publishDesktopLyrics).toHaveBeenLastCalledWith(expect.objectContaining({positionMs:500}));
    stopDesktop();stopDesktop=undefined;stores.player.playback.positionMs=4200;await settle();
    expect(sharedLyricsState.currentIndex).toBe(1);expect(bridge.getTrackLyrics).toHaveBeenCalledTimes(1);
  });
  it('account changes clear current state synchronously and reread instead of reusing the old account',async()=>{
    await settle();stores.providers.identityEpoch++;
    expect(sharedLyricsState.lines).toEqual([]);expect(sharedLyricsState.loading).toBe(true);
    await settle();expect(bridge.getTrackLyrics).toHaveBeenCalledTimes(2);expect(sharedLyricsState.identity?.accountEpoch).toBe(1);
  });
  it('ignores an old offset save failure after switching tracks',async()=>{
    await settle();let reject!:(error:Error)=>void;
    bridge.saveTrackLyricOffset.mockImplementationOnce(()=>new Promise((_,fail)=>reject=fail));
    const old=saveSharedLyricsOffset(500);stores.player.currentItem.track.id='b';await settle();
    reject(new Error('old failure'));await old;
    expect(sharedLyricsState.identity?.trackId).toBe('b');expect(sharedLyricsState.offsetMs).toBe(500);
    expect(sharedLyricsControls.offsetError).toBe('');expect(sharedLyricsControls.savingOffset).toBe(false);
  });
  it('rolls back failed current offset saves and freezes the shared clock on pause',async()=>{
    await settle();bridge.saveTrackLyricOffset.mockRejectedValueOnce(new Error('private path'));
    expect(await saveSharedLyricsOffset(500)).toBe(false);expect(sharedLyricsState.offsetMs).toBe(500);
    expect(sharedLyricsControls.offsetError).toContain('恢复原偏移');
    stores.player.playback.status='paused';expect(lyricsStageClock.query(performance.now()+5000)).toBe(1500);
    stop();expect(sharedLyricsState.lines).toEqual([]);
  });
  it('freezes visual interpolation while buffering and reuses its application lifecycle',async()=>{
    stopDesktop=startDesktopLyrics();await settle();const duplicate=startSharedLyricsSession();
    expect(bridge.getTrackLyrics).toHaveBeenCalledTimes(1);
    stores.player.buffering=true;await settle();
    expect(lyricsStageClock.query(performance.now()+5000)).toBe(1500);
    expect(bridge.publishDesktopLyrics).toHaveBeenLastCalledWith(expect.objectContaining({playing:false,status:'缓冲中'}));
    duplicate();expect(sharedLyricsState.lines).toEqual([]);
  });
});
