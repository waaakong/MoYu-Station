import { finishMotions, motionAllowed, runMotion, type MotionHandle } from './runtime';

/** One delegated listener set, no per-button watchers or permanent compositor layers. */
export function startInteractionMotion() {
  const active = new Map<HTMLElement, MotionHandle>();
  const controls = 'button,a[href],[role="button"]';
  const excluded = '.window-chrome,.viewer-stage,.classic-game,.game-board,[data-motion="off"],[draggable="true"]';
  let pressed: HTMLElement | undefined;
  const reset = (el: HTMLElement) => {
    active.get(el)?.revert(); active.delete(el);
    el.removeAttribute('data-sr-press');
  };
  function press(event: PointerEvent) {
    if (event.button !== 0 || !motionAllowed() || !(event.target instanceof Element)) return;
    const el = event.target.closest<HTMLElement>(controls);
    if (!el || el.closest(excluded) || el.matches(':disabled,[aria-disabled="true"]')) return;
    if (pressed) reset(pressed);
    pressed = el; el.setAttribute('data-sr-press', '');
    active.set(el, runMotion(el, 'sr-control-press', tl => {
      tl.to(el, { '--sr-press-scale': 0.975, duration: 0.09, ease: 'power2.out' });
      // Keep the pressed style while held, but bound retention if an input is lost.
      tl.to({}, { duration: 2 });
    }, () => reset(el)));
  }
  function release() {
    const el = pressed; pressed = undefined;
    if (!el) return;
    active.get(el)?.revert(); active.delete(el);
    if (!motionAllowed() || !el.isConnected) { reset(el); return; }
    el.setAttribute('data-sr-press', '');
    active.set(el, runMotion(el, 'sr-control-release', tl => {
      tl.fromTo(el, { '--sr-press-scale': 0.975 }, { '--sr-press-scale': 1, duration: 0.18, ease: 'power3.out' });
    }, () => reset(el)));
  }
  function settle() {
    pressed = undefined;
    for (const el of [...active.keys()]) reset(el);
  }
  function visibility() { if (document.hidden) { settle(); finishMotions(); } }
  document.addEventListener('pointerdown', press, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', settle, true);
  document.addEventListener('keydown', settle, true);
  document.addEventListener('studyroom:motion-policy', settle);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', settle);
  return () => {
    settle();
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', settle, true);
    document.removeEventListener('keydown', settle, true);
    document.removeEventListener('studyroom:motion-policy', settle);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', settle);
  };
}
