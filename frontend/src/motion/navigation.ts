import type { ObjectDirective } from 'vue';
import { gsap, motionAllowed } from './runtime';

const instances = new WeakMap<HTMLElement, () => void>();
export const motionNavigation: ObjectDirective<HTMLElement> = {
  mounted(nav) {
    const indicator = document.createElement('span');
    indicator.className = 'sr-nav-indicator'; indicator.setAttribute('aria-hidden', 'true');
    nav.prepend(indicator); nav.classList.add('sr-motion-nav');
    let tween: gsap.core.Tween | undefined, initialized = false, frame = 0, current: HTMLElement | null = null;
    const update = (animate: boolean) => {
      const active = nav.querySelector<HTMLElement>('.app-nav__item--active,[aria-selected="true"],[aria-current="page"],[aria-current="true"]');
      if (!active) { indicator.hidden = true; return; }
      indicator.hidden = false;
      const changed = active !== current;
      current = active;
      const width = active.offsetWidth;
      if (width <= 0) { indicator.hidden = true; initialized = false; return; }
      const previousWidth = parseFloat(indicator.style.width || '1') * Number(gsap.getProperty(indicator,'scaleX') || 1);
      const previousX = Number(gsap.getProperty(indicator,'x') || 0);
      const vars = { x: active.offsetLeft, scaleX: 1 };
      tween?.kill();
      // Measure/set the final width once; animate transforms, preserving rounded corners and borders.
      indicator.style.width = `${width}px`;
      if (initialized && changed && animate && motionAllowed()) {
        gsap.set(indicator, {x:previousX,scaleX:previousWidth/width});
        tween = gsap.to(indicator, { ...vars, duration: 0.26, ease: 'power3.out', overwrite: true });
      }
      else gsap.set(indicator, vars);
      initialized = true;
    };
    const schedule = (animate = true) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => update(animate)); };
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.target !== indicator)) schedule();
    });
    mutations.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-current'], childList: true });
    const resize = new ResizeObserver(() => schedule(false)); resize.observe(nav);
    for (const item of nav.children) if (item !== indicator) resize.observe(item);
    const reset = () => { tween?.kill(); update(false); };
    document.addEventListener('studyroom:motion-policy', reset);
    update(false);
    instances.set(nav, () => {
      mutations.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); tween?.kill();
      document.removeEventListener('studyroom:motion-policy', reset); indicator.remove(); nav.classList.remove('sr-motion-nav');
    });
  },
  beforeUnmount(nav) { instances.get(nav)?.(); instances.delete(nav); },
};
