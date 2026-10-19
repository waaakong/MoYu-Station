import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { isProxy } from "vue";
import { useQueueStore } from "../src/stores/queue";
import { hasVolatileWork, prepareLocalQuit, registerQuitSaver } from "../src/window/quitPreparation";
import { chatMemory, clearChatMemory } from "../src/chat/chatMemory";
import { useFocusStore } from "../src/stores/focus";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("window", { studyRoomDesktop: { replaceQueue: vi.fn() } });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  clearChatMemory();
});
describe("safe desktop quit preparation", () => {
  it("sends a plain queue snapshot, not a Vue proxy through contextBridge", async () => {
    const queue = useQueueStore();
    queue.items = [] as any; queue.hydrated = true;
    expect(isProxy(queue.items)).toBe(true);
    await prepareLocalQuit();
    const argument = vi.mocked(window.studyRoomDesktop!.replaceQueue).mock.calls[0]![0];
    expect(isProxy(argument)).toBe(false);
    expect(() => structuredClone(argument)).not.toThrow();
  });
  it("detects memory drafts but never sends or clears them", async () => {
    chatMemory.hallDraft = "保留";
    expect(hasVolatileWork()).toBe(true);
    await prepareLocalQuit();
    expect(chatMemory.hallDraft).toBe("保留");
  });
  it("blocks when saves are in flight or registered game storage fails", async () => {
    const focus = useFocusStore(); focus.operationPending = true;
    await expect(prepareLocalQuit()).rejects.toThrow("正在保存");
    focus.operationPending = false;
    const remove = registerQuitSaver(async () => { throw Error("disk full"); });
    await expect(prepareLocalQuit()).rejects.toThrow("disk full");
    remove();
    await expect(prepareLocalQuit()).resolves.toBeUndefined();
  });
});
