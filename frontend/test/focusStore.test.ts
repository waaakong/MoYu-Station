import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFocusStore } from "../src/stores/focus";
import { listLocalFocusRecords } from "../src/services/focusLocal";

function installBrowserStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
}

describe("focus store lifecycle", () => {
  beforeEach(() => {
    installBrowserStorage();
    delete window.studyRoomDesktop;
    setActivePinia(createPinia());
  });

  it('restores only the last observed checkpoint, paused, after a long shutdown', async () => {
    const store=useFocusStore();
    await store.start({plannedMinutes:25,sceneCode:'forest',timeKey:'morning'},1000);
    store.refresh(4000); store.refresh(8000);
    setActivePinia(createPinia());
    const restored=useFocusStore(); restored.hydrate(3_600_000);
    expect(restored.timerState).toBe('paused');
    expect(restored.snapshot.elapsedSeconds).toBe(7);
    expect(restored.snapshot.remainingSeconds).toBe(1493);
  });

  it('does not invent elapsed time for a legacy running session without checkpoints', async () => {
    const store=useFocusStore();
    await store.start({plannedMinutes:25,sceneCode:'forest',timeKey:'morning'},1000);
    delete store.session!.observedAt; store.persistSession();
    store.hydrate(3_600_000);
    expect(store.timerState).toBe('paused'); expect(store.snapshot.elapsedSeconds).toBe(0);
  });

  it('does not complete a timer after an unobserved sleep gap or a clock jump', async () => {
    const store=useFocusStore();
    await store.start({plannedMinutes:1,sceneCode:'forest',timeKey:'morning'},1000);
    store.refresh(2000);
    expect(store.refresh(120000)).toBe(false);
    expect(store.timerState).toBe('paused'); expect(store.snapshot.elapsedSeconds).toBe(1);
    store.resume(130000); store.refresh(131000); store.refresh(100000);
    expect(store.timerState).toBe('paused'); expect(store.snapshot.elapsedSeconds).toBe(2);
  });

  it('caps a late navigation pause and late completion to the last observed progress', async () => {
    const store=useFocusStore();
    await store.start({plannedMinutes:1,sceneCode:'forest',timeKey:'morning'},1000);
    store.refresh(3000); store.pause(60000);
    expect(store.snapshot.elapsedSeconds).toBe(2);
    store.resume(61000);store.refresh(62000);
    const record=await store.complete(120000);
    expect(record?.completedSeconds).toBe(3);
  });

  it("saves guest completion locally without enabling cloud sync", async () => {
    const store = useFocusStore();
    await store.start({ plannedMinutes: 1, sceneCode: "mountain", timeKey: "morning" }, 1_000);
    for(let now=2000;now<=61000;now+=1000)store.refresh(now);
    const record = await store.complete(61_000);
    expect(record?.completedSeconds).toBe(60);
    expect(record?.syncPolicy).toBe("manual-only");
    expect(record?.syncStatus).toBe("local");
    expect(await listLocalFocusRecords()).toHaveLength(1);
  });

  it("queues a signed-in completion exactly once", async () => {
    const store = useFocusStore();
    await store.start({ plannedMinutes: 1, sceneCode: "forest", timeKey: "dusk", accountScope: "7" }, 1_000);
    for(let now=2000;now<=61000;now+=1000)store.refresh(now);
    const first = await store.complete(61_000);
    const second = await store.complete(62_000);
    expect(first?.clientRecordId).toBe(second?.clientRecordId);
    expect(first?.syncStatus).toBe("pending");
    expect(await listLocalFocusRecords()).toHaveLength(1);
  });

  it("persists a canceled session without adding it to sync", async () => {
    const store = useFocusStore();
    await store.start({ plannedMinutes: 25, sceneCode: "cafe", timeKey: "night", accountScope: "7" }, 1_000);
    await store.cancel(31_000);
    const records = await listLocalFocusRecords();
    expect(records[0]?.status).toBe("canceled");
    expect(records[0]?.syncStatus).toBe("local");
    expect(store.timerState).toBe("idle");
  });

  it('rejects a second start and serializes completion against cancellation',async()=>{
    const store=useFocusStore();await store.start({plannedMinutes:1,sceneCode:'forest',timeKey:'morning'},1000);
    const id=store.activeRecordId;
    await expect(store.start({plannedMinutes:25,sceneCode:'cafe',timeKey:'night'},2000)).rejects.toThrow('已有专注会话');
    expect(store.activeRecordId).toBe(id);
    const completing=store.complete(61000);await expect(store.cancel(61001)).rejects.toThrow('正在保存');await completing;
    expect((await listLocalFocusRecords())[0]?.status).toBe('completed');
  });
});
