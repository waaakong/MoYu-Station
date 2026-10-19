import type { ObjectDirective } from 'vue';
import { runMotion, type MotionHandle } from './runtime';

const effects = new WeakMap<HTMLElement, MotionHandle>();
/** Animate only a deliberate module/source change, never timer ticks or arriving chat messages. */
export const motionContent: ObjectDirective<HTMLElement, unknown> = {
  updated(element, binding) {
    if (binding.value === binding.oldValue || !element.isConnected || !element.getClientRects().length) return;
    effects.get(element)?.revert();
    effects.set(element, runMotion(element, 'sr-content-change', tl => {
      tl.fromTo(element, {y:5}, {y:0,duration:0.22}, 0);
    }));
  },
  beforeUnmount(element) { effects.get(element)?.revert(); effects.delete(element); },
};
