import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitWindowBounds } from "../src/main/windowGeometry";
const mocks = vi.hoisted(() => ({ quit: vi.fn(), windows: [] as any[] }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    max = false; focused = true; hidden = false; destroyed = false;
    bounds = { x: 0, y: 0, width: 1200, height: 800 };
    webContents = { send: vi.fn(), isDestroyed: () => false };
    constructor(readonly options: any) { super(); mocks.windows.push(this); }
    isDestroyed() { return this.destroyed; } isMaximized() { return this.max; }
    isFocused() { return this.focused; } isMinimized() { return false; } isFullScreen() { return false; }
    maximize() { this.max = true; this.emit("maximize"); }
    unmaximize() { this.max = false; this.emit("unmaximize"); }
    getNormalBounds() { return this.bounds; } getBounds() { return this.bounds; }
    setMinimumSize() {} setBounds(bounds: any) { this.bounds = bounds; }
    show() { this.hidden = false; } hide() { this.hidden = true; } focus() {}
    restore() {} minimize() {} close() { this.emit("close", { preventDefault: vi.fn() }); }
  }
  return { app: { quit: mocks.quit }, BrowserWindow: Window,
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }] }) };
});
import { MainWindowManager, MAIN_WINDOW_OPTIONS } from "../src/main/windowManager";
import { windowCloseBehaviorSchema, windowCloseDecisionSchema, windowQuitReadySchema } from "../src/main/ipc/validation";

let manager: MainWindowManager;
let saved: Map<string, unknown>;
let write: ReturnType<typeof vi.fn>;
function create(behavior?: unknown) {
  saved = new Map([["window.close-behavior-v1", behavior]]);
  write = vi.fn((key, value) => saved.set(key, value));
  manager = new MainWindowManager("preload", { getSetting: (key: string) => saved.get(key), setSetting: write, isUpdateFrozen: () => false } as any);
  return manager;
}
beforeEach(() => { vi.useFakeTimers(); mocks.quit.mockClear(); });
afterEach(() => { manager?.window.emit("closed"); vi.useRealTimers(); });
describe("custom desktop window", () => {
  it("keeps native resizing, opaque rendering and security", () => {
    expect(MAIN_WINDOW_OPTIONS).toMatchObject({ frame: false, transparent: false, thickFrame: true, hasShadow: true,
      webPreferences: { sandbox: true, webSecurity: true, contextIsolation: true, nodeIntegration: false } });
  });
  it("deduplicates close, cancels without storing, rejects late decisions", () => {
    create(); manager.requestClose(); const id = manager.readState().closeRequest!.id;
    manager.requestClose(); expect(manager.readState().closeRequest!.id).toBe(id);
    manager.resolveClose({ id, action: "cancel", remember: true });
    expect(write).not.toHaveBeenCalled(); expect(manager.readState().closeRequest).toBeUndefined();
    expect(() => manager.resolveClose({ id, action: "quit", remember: false })).toThrow("WINDOW_CLOSE_STALE");
  });
  it("remembers tray only after explicit confirmation; explicit exit still prepares", () => {
    create(); manager.setTrayAvailability(() => true); manager.requestClose();
    manager.resolveClose({ id: manager.readState().closeRequest!.id, action: "tray", remember: true });
    expect(saved.get("window.close-behavior-v1")).toBe("tray");
    expect((manager.window as any).hidden).toBe(true);
    manager.requestExit(); expect(manager.readState().closeRequest?.phase).toBe("prepare");
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it("does not hide when tray is unavailable or preference cannot be saved", () => {
    create("tray"); manager.requestClose();
    expect((manager.window as any).hidden).toBe(false);
    const id = manager.readState().closeRequest!.id;
    expect(() => manager.resolveClose({ id, action: "tray", remember: false })).toThrow("WINDOW_TRAY_UNAVAILABLE");
    manager.setTrayAvailability(() => true); write.mockImplementation(() => { throw Error("disk"); });
    expect(() => manager.resolveClose({ id, action: "tray", remember: true })).toThrow("disk");
    expect((manager.window as any).hidden).toBe(false); expect(manager.readState().closeRequest?.id).toBe(id);
  });
  it("fails closed on save failure and timeout; only current prepared ID may quit", () => {
    create("quit"); manager.requestClose(); const old = manager.readState().closeRequest!.id;
    manager.completeQuit({ id: old, ready: false }); expect(mocks.quit).not.toHaveBeenCalled();
    manager.resolveClose({ id: manager.readState().closeRequest!.id, action: "quit", remember: false });
    const timed = manager.readState().closeRequest!.id; vi.advanceTimersByTime(15000);
    expect(() => manager.completeQuit({ id: timed, ready: true })).toThrow();
    manager.requestExit(); manager.completeQuit({ id: manager.readState().closeRequest!.id, ready: true });
    expect(mocks.quit).toHaveBeenCalledOnce();
  });
  it("publishes maximize/restore state and defaults unknown preferences to ask", () => {
    create({ malicious: true }); expect(manager.readState().closeBehavior).toBe("ask");
    const previous = manager.readState().revision;
    manager.toggleMaximize(); expect(manager.readState().maximized).toBe(true);
    manager.window.unmaximize(); expect(manager.readState().maximized).toBe(false);
    expect(manager.readState().revision).toBeGreaterThan(previous);
    manager.setCloseBehavior("quit"); expect(saved.get("window.close-behavior-v1")).toBe("quit");
    manager.setCloseBehavior("ask"); expect(manager.readState().closeBehavior).toBe("ask");
  });
  it("does not time out while the user reviews a data-loss warning; resumes save timeout afterwards", () => {
    create("quit"); manager.requestClose(); const id = manager.readState().closeRequest!.id;
    manager.completeQuit({ id, ready: "waiting" });
    vi.advanceTimersByTime(60000); expect(manager.readState().closeRequest?.id).toBe(id);
    manager.completeQuit({ id, ready: "working" });
    vi.advanceTimersByTime(15000); expect(manager.readState().closeRequest?.id).not.toBe(id);
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it("validates narrow IPC inputs", () => {
    expect(windowCloseBehaviorSchema.safeParse("kill").success).toBe(false);
    expect(windowCloseDecisionSchema.safeParse({ id: "arbitrary", action: "quit", remember: true }).success).toBe(false);
    expect(windowQuitReadySchema.safeParse({ id: crypto.randomUUID(), ready: true, force: true }).success).toBe(false);
  });
});
describe("DIP window recovery", () => {
  it("clamps offscreen bounds below taskbar and handles small scaled displays", () => {
    const result = fitWindowBounds({ x: 5000, y: -1000, width: 1440, height: 900 }, [{ x: 0, y: 0, width: 960, height: 580 }]);
    expect(result).toEqual({ x: 0, y: 0, width: 960, height: 580 });
  });
  it("keeps a negative-coordinate monitor without multiplying scale", () => {
    const result = fitWindowBounds({ x: -1300, y: 30, width: 1200, height: 700 },
      [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1440, y: 0, width: 1440, height: 860 }]);
    expect(result).toEqual({ x: -1300, y: 30, width: 1200, height: 700 });
  });
});
