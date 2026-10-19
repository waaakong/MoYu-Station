import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { runMotion, type MotionHandle } from '../motion/runtime';

/** Animate only the newly mounted page, never retain an old account/page for exit. */
export function usePageMotion(options: {
  root: () => unknown;
  reduced: () => boolean;
  withinShell: () => boolean;
  sessionKey: () => string;
}) {
  const router = useRouter();
  let active: MotionHandle | undefined;
  let generation = 0;
  let keyboard = false;
  let disposed = false;

  function cancel() {
    generation++;
    active?.revert();
    active = undefined;
  }
  function pointerInput() { keyboard = false; cancel(); }
  function keyboardInput() { keyboard = true; cancel(); }
  function visibilityChanged() { if (document.hidden) cancel(); }

  const removeHook = router.afterEach(async (to, from, failure) => {
    if (failure || to.path === from.path) return;
    cancel();
    // First load, query-only changes and keyboard navigation do not need motion.
    if (!from.matched.length || keyboard || options.reduced() || document.hidden) return;
    const current = generation;
    await nextTick();
    if (disposed || current !== generation || options.reduced()) return;
    const root = options.root();
    if (!(root instanceof HTMLElement) || !root.isConnected) return;
    const groups = [...root.querySelectorAll<HTMLElement>('[data-motion-group]')]
      .filter(el => el.getClientRects().length > 0).slice(0, 5);
    // Never fade a page ancestor: it would isolate all descendant glass backdrops.
    active = runMotion(root, 'sr-page-enter', tl => {
      if (options.withinShell()) {
        tl.fromTo(groups.length ? groups : root, { y: 8 }, { y: 0, duration: 0.28, stagger: 0.035 }, 0);
      } else {
        const content = root.querySelector('[data-motion-group]');
        if (content) tl.fromTo(content, { y: 8 }, { y: 0, duration: 0.3 }, 0);
      }
      const copy = [...root.querySelectorAll('[data-motion-copy]')];
      if (copy.length) tl.fromTo(copy, { autoAlpha: 0.55, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.035 }, 0.035);
    });
  });

  watch(options.reduced, value => { if (value) cancel(); }, { flush: 'sync' });
  watch(options.sessionKey, cancel, { flush: 'sync' });
  onMounted(() => {
    document.addEventListener('pointerdown', pointerInput, true);
    document.addEventListener('keydown', keyboardInput, true);
    document.addEventListener('visibilitychange', visibilityChanged);
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancel();
    removeHook();
    document.removeEventListener('pointerdown', pointerInput, true);
    document.removeEventListener('keydown', keyboardInput, true);
    document.removeEventListener('visibilitychange', visibilityChanged);
  });
}
