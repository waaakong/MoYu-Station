import { describe, expect, it, vi } from "vitest";
import { bindEntertainmentLifecycle } from "../src/entertainment/lifecycle";

describe("entertainment lifecycle", () => {
  it("tracks visibility, focus and desktop suspend independently", () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    let visibility: DocumentVisibilityState = "visible";
    let desktopListener: ((event: { type: "suspend" | "resume" }) => void) | undefined;
    const unsubscribe = vi.fn();
    const changes: Array<[string, boolean]> = [];
    const cleanup = bindEntertainmentLifecycle((reason, active) => changes.push([reason, active]), {
      windowTarget,
      documentTarget,
      visibilityState: () => visibility,
      subscribeDesktop: (listener) => { desktopListener = listener; return unsubscribe; }
    });

    visibility = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("blur"));
    desktopListener?.({ type: "suspend" });
    desktopListener?.({ type: "resume" });
    windowTarget.dispatchEvent(new Event("focus"));
    expect(changes).toEqual([
      ["hidden", false], ["hidden", true], ["blurred", true],
      ["suspended", true], ["suspended", false], ["blurred", false]
    ]);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
    windowTarget.dispatchEvent(new Event("blur"));
    expect(changes).toHaveLength(6);
  });
});
