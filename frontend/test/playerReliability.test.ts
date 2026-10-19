import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { QueueItem } from "@studyroom/contracts";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), queue: { items: [] as QueueItem[], revision: 0 },
  load: vi.fn(), play: vi.fn(), pause: vi.fn(), clear: vi.fn(), destroy: vi.fn(), toast: vi.fn()
}));
vi.mock("../src/services/radio", () => ({ resolveRadioPlaybackUrl: mocks.resolve }));
vi.mock("../src/stores/radio", () => ({ RADIO_RECONNECT_DELAYS: [1000, 2000] }));
vi.mock("../src/stores/queue", () => ({ useQueueStore: () => mocks.queue }));
vi.mock("../src/stores/shell", () => ({ useShellStore: () => ({ toast: mocks.toast }) }));
vi.mock("../src/audio/core/audioEngine", () => ({ AudioEngine: class {
  load = mocks.load; play = mocks.play; pause = mocks.pause; clear = mocks.clear; destroy = mocks.destroy;
  setVolume() {} setMuted() {} prepareNext() {}
} }));
import { usePlayerStore } from "../src/stores/player";

function item(id: string, radio = false): QueueItem {
  return { id, queuedAt: 1, track: { id, title: id, artist: "Test", durationMs: 1000,
    source: radio ? { kind: "radio", stationId: id } : { kind: "builtin", assetId: "/test.wav" } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
describe("player intent and delayed work", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); setActivePinia(createPinia());
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal("window", {});
    mocks.queue.items = [item("a", true), item("b")];
    mocks.resolve.mockResolvedValue("https://radio.invalid/a");
    mocks.play.mockResolvedValue(undefined); mocks.destroy.mockResolvedValue(undefined);
    usePlayerStore().initialize();
  });
  afterEach(() => { usePlayerStore().dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("never silently switches platforms after a provider network failure",async()=>{
    const selected=item("provider-track");
    selected.track.source={kind:"provider",providerId:"netease",trackId:"1"};
    selected.track.providerCandidates=["netease","qq"].map(providerId=>({id:`${providerId}:1`,providerId:providerId as "netease"|"qq",trackId:"1",title:"same",artists:["Test"],versionTags:[],quality:"unknown",rights:"available",isAvailable:true,matchScore:1}));
    mocks.queue.items=[selected];
    const prepare=vi.fn(async()=>({mediaToken:"test"}));
    vi.stubGlobal("window",{studyRoomDesktop:{prepareProviderPlayback:prepare}});
    const player=usePlayerStore();await player.load(selected,0,true);
    await player.handlePlaybackError("MEDIA_NETWORK_ERROR");
    expect(prepare).toHaveBeenCalledTimes(1);expect(player.playback.status).toBe("error");
    expect(player.currentItem?.track.source).toMatchObject({providerId:"netease"});
  });
  it('pauses a revoked provider and forces playback revalidation without clearing the queue',async()=>{
    const player=usePlayerStore();player.dispose();let changed!:(event:any)=>void;
    vi.stubGlobal('window',{studyRoomDesktop:{onMediaCommand:()=>()=>{},onSourceSwitch:()=>()=>{},onProviderStatusChanged:(listener:any)=>{changed=listener;return()=>{}}}});
    player.initialize();const selected=item('provider-track');selected.track.source={kind:'provider',providerId:'qq',trackId:'test'};mocks.queue.items=[selected];player.playback.currentItemId=selected.id;player.playback.status='playing';player.loadedItemId=selected.id;
    changed({status:{providerId:'qq',enabled:true,state:'expired',capabilities:['search']}});
    expect(player.playback.status).toBe('error');expect(player.playback.errorCode).toBe('PROVIDER_SESSION_EXPIRED');expect(player.loadedItemId).toBeUndefined();expect(mocks.queue.items).toHaveLength(1);expect(mocks.pause).toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    changed({status:{providerId:'qq',enabled:true,state:'signed-in',capabilities:['search','playback']}});
    expect(player.playback.status).toBe('paused');expect(player.wantsPlayback).toBe(false);expect(mocks.play).not.toHaveBeenCalled();
  });

  it('restores platform queues paused without resolving a URL before identity recovery', () => {
    const player=usePlayerStore();player.dispose();const selected=item('restore-provider');selected.track.source={kind:'provider',providerId:'netease',trackId:'test'};mocks.queue.items=[selected];player.playback.currentItemId=selected.id;player.playback.positionMs=120;
    const prepare=vi.fn();vi.stubGlobal('window',{studyRoomDesktop:{prepareProviderPlayback:prepare,onMediaCommand:vi.fn(),onSourceSwitch:vi.fn()}});player.initialize();
    expect(player.playback.status).toBe('paused');expect(player.playback.positionMs).toBe(120);expect(prepare).not.toHaveBeenCalled();
    player.applicationIdentityChanged(false);expect(player.playback.errorCode).toBe('PROVIDER_APP_LOGIN_REQUIRED');
    player.applicationIdentityChanged(true);expect(player.playback.status).toBe('paused');expect(player.playback.errorCode).toBeUndefined();expect(player.loadedItemId).toBeUndefined();expect(player.wantsPlayback).toBe(false);expect(prepare).not.toHaveBeenCalled();
  });
  it('does not interrupt local playback when application identity changes',()=>{
    const player=usePlayerStore();player.playback.currentItemId=mocks.queue.items[1].id;player.playback.status='playing';player.applicationIdentityChanged(false);expect(player.playback.status).toBe('playing');
  });
  it('keeps the stable IPC failure reason, blocks repeated rate-limited requests and retries only after cooldown', async () => {
    const selected=item('limited');selected.track.source={kind:'provider',providerId:'qq',trackId:'test'};mocks.queue.items=[selected];
    const reason=new Error('translated message');reason.name='PROVIDER_RATE_LIMITED';
    const prepare=vi.fn().mockRejectedValueOnce(reason).mockResolvedValue({mediaToken:'new'});
    vi.stubGlobal('window',{studyRoomDesktop:{prepareProviderPlayback:prepare}});
    const player=usePlayerStore();await player.load(selected,120,true);
    expect(player.playback.errorCode).toBe('PROVIDER_RATE_LIMITED');expect(player.wantsPlayback).toBe(false);
    await player.retry();await player.load(selected,120,true);expect(prepare).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60001);expect(prepare).toHaveBeenCalledTimes(1);
    await player.retry();expect(prepare).toHaveBeenCalledTimes(2);expect(player.playback.status).toBe('playing');
  });
  it('a buffer failure stops intent, preserves position and cannot be overwritten by a late play rejection', async () => {
    const player=usePlayerStore();await player.load(mocks.queue.items[1],300,true);
    await player.handlePlaybackError('MEDIA_BUFFER_TIMEOUT');expect(player.wantsPlayback).toBe(false);
    expect(player.playback.positionMs).toBe(300);expect(player.playback.errorCode).toBe('MEDIA_BUFFER_TIMEOUT');
    await player.handlePlaybackError('PLAYBACK_REJECTED');expect(player.playback.errorCode).toBe('MEDIA_BUFFER_TIMEOUT');
    await player.retry();expect(player.playback.status).toBe('playing');
  });

  it.each(["pause", "clear", "dispose"] as const)("%s cancels a reconnect timer", async (action) => {
    const player = usePlayerStore();
    await player.load(mocks.queue.items[0], 0, true);
    await player.handlePlaybackError("MEDIA_NETWORK_ERROR");
    expect(vi.getTimerCount()).toBe(1);
    player[action]();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pause rejects a late radio address; explicit resume resolves a fresh address", async () => {
    const delayed = deferred<string>(); mocks.resolve.mockReturnValueOnce(delayed.promise);
    const player = usePlayerStore();
    const loading = player.load(mocks.queue.items[0], 0, true);
    player.pause(); delayed.resolve("https://radio.invalid/old"); await loading;
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.play).not.toHaveBeenCalled();
    expect(player.playback.status).toBe("paused");
    await player.play();
    expect(mocks.resolve).toHaveBeenCalledTimes(2); expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(player.playback.status).toBe("playing");
  });

  it("a late play acknowledgement cannot reverse pause", async () => {
    const delayed = deferred<void>(); mocks.play.mockReturnValueOnce(delayed.promise);
    const player = usePlayerStore();
    await player.load(mocks.queue.items[1]);
    const playing = player.play(); player.pause(); delayed.resolve(); await playing;
    expect(player.playback.status).toBe("paused");
  });

  it("completion recording cannot advance the queue after pause", async () => {
    const delayed = deferred<void>();
    vi.stubGlobal("window", { studyRoomDesktop: { recordPlaybackEvent: vi.fn((event) => event.state === "completed" ? delayed.promise : Promise.resolve()) } });
    const player = usePlayerStore();
    await player.load(mocks.queue.items[0], 0, true);
    const ending = player.handleEnded(); player.pause(); delayed.resolve(); await ending;
    expect(player.playback.currentItemId).toBe("a"); expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("switching tracks rejects the previous delayed address", async () => {
    const delayed = deferred<string>(); mocks.resolve.mockReturnValueOnce(delayed.promise);
    const player = usePlayerStore();
    const oldLoad = player.load(mocks.queue.items[0], 0, true);
    await player.load(mocks.queue.items[1], 0, true);
    delayed.resolve("https://radio.invalid/old"); await oldLoad;
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(player.playback.currentItemId).toBe("b");
  });
});
