import { gsap } from 'gsap';

export { gsap };
export const motionTiming = { enter: 0.28, leave: 0.15, quick: 0.16, ease: 'power3.out' } as const;
export interface MotionHandle { revert(): void; finish(): void }
const running = new Set<MotionHandle>();
let reduced = false;

export function motionAllowed() {
  return !reduced && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Finishing restores styles and runs completion callbacks; no hidden click blockers survive. */
export function finishMotions() { for (const handle of [...running]) handle.finish(); }
export function setMotionReduced(value: boolean) {
  reduced = value;
  if (value) finishMotions();
  document.dispatchEvent(new Event('studyroom:motion-policy'));
}

/** Each effect owns a bounded context. Completion, cancellation and unmount all restore CSS. */
export function runMotion(
  scope: Element,
  id: string,
  build: (timeline: gsap.core.Timeline) => void,
  complete?: () => void,
): MotionHandle {
  let context: gsap.Context | undefined;
  let timeline: gsap.core.Timeline | undefined;
  let ended = false;
  const previous = scope.getAttribute('data-sr-motion');
  function cleanup() {
    if (ended) return false;
    ended = true;
    running.delete(handle);
    context?.revert();
    if (previous === null) scope.removeAttribute('data-sr-motion');
    else scope.setAttribute('data-sr-motion', previous);
    return true;
  }
  const handle: MotionHandle = {
    revert() { cleanup(); },
    finish() { if (cleanup()) complete?.(); },
  };
  if (!motionAllowed()) { ended = true; complete?.(); return handle; }
  scope.setAttribute('data-sr-motion', id);
  running.add(handle);
  try {
    context = gsap.context(() => {
      timeline = gsap.timeline({ paused: true, id, defaults: { duration: motionTiming.enter, ease: motionTiming.ease }, onComplete: () => handle.finish() });
      build(timeline);
    }, scope);
    timeline!.play();
  } catch {
    handle.finish(); // An optional effect must never prevent access to the UI.
  }
  return handle;
}

const dialogEffects = new Map<HTMLDialogElement, MotionHandle>();
const openDialogs = new Set<HTMLDialogElement>();
const cancelBound = new WeakSet<HTMLDialogElement>();
function dialogPanel(dialog: HTMLDialogElement): Element {
  return dialog.matches('.sr-overlay-dialog') ? dialog.firstElementChild || dialog : dialog;
}
function dialogFrame(dialog: HTMLDialogElement) {
  const panel = dialogPanel(dialog);
  return { x: Number(gsap.getProperty(panel,'x')) || 0, y: Number(gsap.getProperty(panel,'y')) || 0, alpha: parseFloat(getComputedStyle(dialog).getPropertyValue('--sr-backdrop-alpha')) || 0 };
}
function backdrop(timeline: gsap.core.Timeline, dialog: HTMLDialogElement, entering: boolean, from = entering ? 0 : 1) {
  timeline.fromTo(dialog, { '--sr-backdrop-alpha': from }, { '--sr-backdrop-alpha': entering ? 1 : 0, duration: entering ? 0.22 : 0.15 }, 0);
}
export function openMotionDialog(dialog?: HTMLDialogElement | null, placement: 'center' | 'right' = 'center') {
  if (!dialog?.isConnected) return;
  if (!cancelBound.has(dialog)) {
    cancelBound.add(dialog);
    dialog.addEventListener('cancel', event => {
      // Component-specific cancellation (draft preservation, confirmation, etc.) wins.
      if (event.defaultPrevented) return;
      event.preventDefault(); closeMotionDialog(dialog);
    });
    dialog.addEventListener('close', () => { if (dialog.open) return; dialogEffects.get(dialog)?.revert(); dialogEffects.delete(dialog); openDialogs.delete(dialog); });
  }
  const wasOpen = dialog.open;
  const reversing = wasOpen && dialog.getAttribute('data-sr-motion') === 'sr-dialog-leave';
  if (wasOpen && !reversing) return;
  const interrupted = reversing ? dialogFrame(dialog) : undefined;
  dialogEffects.get(dialog)?.revert();
  dialogEffects.delete(dialog);
  if (!wasOpen) dialog.showModal();
  openDialogs.add(dialog);
  if (!motionAllowed()) return;
  const panel = dialogPanel(dialog);
  const right = placement === 'right' || dialog.matches('.drawer-layer,.sr-overlay-dialog--right');
  const effect = runMotion(dialog, 'sr-dialog-enter', tl => {
    backdrop(tl, dialog, true, interrupted?.alpha ?? 0);
    // Transform only: keep the panel's backdrop-filter sampling its actual surroundings.
    tl.fromTo(panel, { x: interrupted?.x ?? (right ? 24 : 0), y: interrupted?.y ?? (right ? 0 : 10) }, { x: 0, y: 0, duration: right ? 0.3 : 0.26 }, 0);
  }, () => dialogEffects.delete(dialog));
  if (dialog.hasAttribute('data-sr-motion')) dialogEffects.set(dialog, effect);
}
export function closeMotionDialog(dialog?: HTMLDialogElement | null, immediate = false, complete?: () => void) {
  if (!dialog) { complete?.(); return; }
  if (!immediate && dialog.getAttribute('data-sr-motion') === 'sr-dialog-leave') return;
  const interrupted = dialogEffects.has(dialog) ? dialogFrame(dialog) : undefined;
  dialogEffects.get(dialog)?.revert();
  dialogEffects.delete(dialog);
  const close = () => { dialogEffects.delete(dialog); openDialogs.delete(dialog); if (dialog.open) dialog.close(); complete?.(); };
  if (!dialog.open || immediate || !dialog.isConnected || !motionAllowed()) { close(); return; }
  const right = dialog.matches('.drawer-layer,.sr-overlay-dialog--right');
  const effect = runMotion(dialog, 'sr-dialog-leave', tl => {
    backdrop(tl, dialog, false, interrupted?.alpha ?? 1);
    tl.fromTo(dialogPanel(dialog), {x:interrupted?.x ?? 0,y:interrupted?.y ?? 0}, { x: right ? 16 : 0, y: right ? 0 : 6, duration: 0.15, ease: 'power2.out' }, 0);
  }, close);
  if (dialog.hasAttribute('data-sr-motion')) dialogEffects.set(dialog, effect);
}

/** No deferred closing or retained private content when identity changes. */
export function resetDialogMotions() {
  for (const dialog of [...openDialogs]) {
    dialogEffects.get(dialog)?.revert();
    dialogEffects.delete(dialog);
    openDialogs.delete(dialog);
    if (dialog.open) dialog.close();
  }
}
