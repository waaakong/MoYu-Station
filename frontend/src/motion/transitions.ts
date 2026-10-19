import { onBeforeUnmount } from 'vue';
import { runMotion, type MotionHandle } from './runtime';

/** Vue owns visibility/removal; GSAP owns only the short visual transition. */
export function useMotionTransition(kind: 'menu' | 'panel' | 'toast' | 'drawer' = 'menu') {
  const active = new Map<Element, { effect: MotionHandle; done: () => void }>();
  function cancel(element: Element) {
    const item = active.get(element);
    if (!item) return;
    active.delete(element); item.effect.revert(); item.done();
  }
  function animate(element: Element, done: () => void, entering: boolean) {
    cancel(element);
    let ended = false;
    const finish = () => { if (ended) return; ended = true; active.delete(element); done(); };
    const effect = runMotion(element, `sr-${kind}-${entering ? 'enter' : 'leave'}`, tl => {
      const offset = kind === 'drawer' ? { x: entering ? 22 : 12 } : { y: kind === 'toast' ? 8 : kind === 'panel' ? 10 : -5 };
      if (entering) tl.fromTo(element, { ...offset, opacity: 0.65 }, { x: 0, y: 0, opacity: 1, duration: kind === 'panel' ? 0.28 : 0.2 }, 0);
      else tl.to(element, { ...offset, opacity: 0, duration: 0.13, ease: 'power2.out' }, 0);
    }, finish);
    if (!ended) active.set(element, { effect, done: finish });
  }
  onBeforeUnmount(() => { for (const element of [...active.keys()]) cancel(element); });
  return { css: false, onEnter: (el: Element, done: () => void) => animate(el, done, true), onLeave: (el: Element, done: () => void) => animate(el, done, false), onEnterCancelled: cancel, onLeaveCancelled: cancel };
}
