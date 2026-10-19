import type { DesktopLifecycleEvent, EntertainmentPauseReason } from "@studyroom/contracts";

interface EventTargetLike {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface EntertainmentLifecycleDependencies {
  windowTarget?: EventTargetLike;
  documentTarget?: EventTargetLike;
  visibilityState?: () => DocumentVisibilityState;
  subscribeDesktop?: (listener: (event: DesktopLifecycleEvent) => void) => () => void;
}

export function bindEntertainmentLifecycle(
  setPauseReason: (reason: EntertainmentPauseReason, active: boolean) => void,
  dependencies: EntertainmentLifecycleDependencies = {}
): () => void {
  const windowTarget = dependencies.windowTarget ?? window;
  const documentTarget = dependencies.documentTarget ?? document;
  const visibilityState = dependencies.visibilityState ?? (() => document.visibilityState);
  const subscribeDesktop = dependencies.subscribeDesktop ?? window.studyRoomDesktop?.onDesktopLifecycle;
  const onVisibility = () => setPauseReason("hidden", visibilityState() === "hidden");
  const onBlur = () => setPauseReason("blurred", true);
  const onFocus = () => setPauseReason("blurred", false);
  const onDesktop = (event: DesktopLifecycleEvent) => setPauseReason("suspended", event.type === "suspend");

  documentTarget.addEventListener("visibilitychange", onVisibility as EventListener);
  windowTarget.addEventListener("blur", onBlur as EventListener);
  windowTarget.addEventListener("focus", onFocus as EventListener);
  const unsubscribeDesktop = subscribeDesktop?.(onDesktop);
  onVisibility();

  return () => {
    documentTarget.removeEventListener("visibilitychange", onVisibility as EventListener);
    windowTarget.removeEventListener("blur", onBlur as EventListener);
    windowTarget.removeEventListener("focus", onFocus as EventListener);
    unsubscribeDesktop?.();
  };
}
