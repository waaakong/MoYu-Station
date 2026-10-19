import { gsap } from '../motion/runtime';

/** Enhance the pre-Vue surface; readiness, skipping and safe retry remain its responsibility. */
export function attachStartupMotion() {
  const overlay = document.getElementById('moyu-startup');
  if (!overlay || overlay.dataset.motionEngine) return () => {};
  let context: gsap.Context | undefined, disposed = false;
  overlay.dataset.motionEngine = 'gsap';
  function stop() { context?.revert(); context = undefined; }
  function synchronize() {
    if (disposed) return;
    if (overlay!.dataset.static === 'true' || overlay!.dataset.state !== 'preparing') { stop(); return; }
    if (context) return;
    context = gsap.context(() => {
      const frame = overlay!.querySelector<SVGPathElement>('.moyu-startup__frame')!;
      const length = frame.getTotalLength();
      const timeline = gsap.timeline({ id: 'sr-startup-brand', paused: true, defaults: { ease: 'power3.out' } });
      timeline.addLabel('window', 0.12)
        .fromTo('.moyu-startup__aura', { opacity: 0, scale: 0.94, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 1.7, stagger: 0.16 }, 0)
        .fromTo(frame, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.4 }, { strokeDashoffset: 0, opacity: 1, duration: 1.05 }, 'window')
        .fromTo('.moyu-startup__sun', { opacity: 0, y: 6, scale: 0.8, transformOrigin: '50% 50%' }, { opacity: 1, y: 0, scale: 1, duration: 0.9 }, 'window+=0.2')
        .addLabel('landscape', 0.52)
        .fromTo('.moyu-startup__mountain--back', { opacity: 0, y: 9 }, { opacity: 1, y: 0, duration: 0.9 }, 'landscape')
        .fromTo('.moyu-startup__mountain', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.95 }, 'landscape+=0.18')
        .fromTo('.moyu-startup__water', { opacity: 0, scaleX: 0.5, transformOrigin: '50% 50%' }, { opacity: 1, scaleX: 1, duration: 0.8 }, 'landscape+=0.42')
        .fromTo('.moyu-startup__ripple', { opacity: 0, scaleX: 0.5, scaleY: 0.75, transformOrigin: '50% 50%' }, { opacity: 0.4, scaleX: 1, scaleY: 1, duration: 0.7, stagger: 0.22 }, 1.18)
        .to('.moyu-startup__ripple', { opacity: 0, scaleX: 1.4, duration: 0.75, stagger: 0.22, ease: 'sine.out' }, 1.88)
        .fromTo('.moyu-startup__horizon', { opacity: 0, scaleX: 0.6 }, { opacity: 1, scaleX: 1, duration: 1.2 }, 0.68)
        .addLabel('brand', 1.02)
        .fromTo('h1 span', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, 'brand')
        .fromTo('.moyu-startup__english', { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.7 }, 'brand+=0.18')
        .fromTo('.moyu-startup__tagline', { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.75 }, 'brand+=0.32');
      const elapsed = Math.max(0, (performance.now() - Number(overlay!.dataset.startedAt || performance.now())) / 1000);
      timeline.play(Math.min(elapsed, timeline.duration()));
    }, overlay!);
  }
  const observer = new MutationObserver(synchronize);
  observer.observe(overlay, { attributes: true, attributeFilter: ['data-state', 'data-static'] });
  const removal = new MutationObserver(() => { if (!overlay.isConnected) dispose(); });
  removal.observe(document.body, { childList: true });
  function dispose() { if (disposed) return; disposed = true; observer.disconnect(); removal.disconnect(); stop(); }
  synchronize();
  return dispose;
}
