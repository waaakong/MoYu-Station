/* Original MoYu startup surface. Executed before Vue; no platform credentials are read. */
(() => {
  if (!window.studyRoomDesktop || window.moyuStartupOverlay) return;
  const app = document.getElementById('app');
  if (!app) return;
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem('studyroom-shell-preferences-v2') || '{}') || {}; } catch { /* Safe defaults. */ }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const overlay = document.createElement('section');
  overlay.id = 'moyu-startup';
  overlay.setAttribute('aria-label', '墨屿正在启动');
  overlay.dataset.state = 'preparing';
  overlay.innerHTML = `
    <div class="moyu-startup__atmosphere" aria-hidden="true"><div class="moyu-startup__aura"></div><div class="moyu-startup__aura moyu-startup__aura--near"></div></div>
    <header class="moyu-startup__chrome"><span>墨屿 · MOYU</span><button class="moyu-startup__close" type="button" aria-label="关闭窗口" title="关闭窗口"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></header>
    <div class="moyu-startup__center">
      <div class="moyu-startup__horizon" aria-hidden="true"></div>
      <svg class="moyu-startup__mark" viewBox="0 0 112 138" fill="none" aria-hidden="true"><g class="moyu-startup__sun"><circle cx="67" cy="46" r="9" fill="currentColor" opacity=".16"/><circle cx="67" cy="46" r="3" fill="currentColor" opacity=".7"/></g><path class="moyu-startup__frame" d="M21 113V53a35 35 0 0 1 70 0v60q0 10-10 10H31q-10 0-10-10Z" stroke="currentColor" stroke-width="2"/><path class="moyu-startup__mountain--back" d="M30 94 43 68q3-5 6 0l18 26Z" fill="currentColor"/><path class="moyu-startup__mountain" d="m29 99 15-10q4-2 9-15l7-15q3-6 6 0l8 23q3 7 10 17Z" fill="currentColor"/><g class="moyu-startup__water" stroke="currentColor" stroke-linecap="round"><path d="M41 109h30" stroke-width="1.7"/><path d="M48 115h16" stroke-width="1" opacity=".35"/></g></svg>
      <svg class="moyu-startup__ripples" viewBox="0 0 180 24" fill="none" aria-hidden="true"><ellipse class="moyu-startup__ripple" cx="90" cy="10" rx="35" ry="3"/><ellipse class="moyu-startup__ripple" cx="90" cy="10" rx="52" ry="5"/></svg>
      <h1 aria-label="墨屿"><span aria-hidden="true">墨</span><span aria-hidden="true">屿</span></h1>
      <p class="moyu-startup__english" aria-hidden="true">MOYU STATION</p>
      <p class="moyu-startup__tagline">给今天留一间，会呼吸的自习室</p>
      <p class="moyu-startup__status" role="status" aria-live="polite">正在打开本地空间</p>
      <p class="moyu-startup__detail">准备好后自动进入</p>
      <div class="moyu-startup__actions" hidden><button type="button" data-action="wait">继续等待</button><button type="button" data-action="reload" hidden>保存并重新加载</button><button type="button" data-action="quit">关闭后重试</button></div>
    </div>
    <footer class="moyu-startup__footer"><span>FOCUS · LISTEN · RESET</span><button type="button" data-action="skip">跳过动画</button></footer>`;
  const status = overlay.querySelector('.moyu-startup__status');
  const detail = overlay.querySelector('.moyu-startup__detail');
  const actions = overlay.querySelector('.moyu-startup__actions');
  const skip = overlay.querySelector('[data-action="skip"]');
  const reload = overlay.querySelector('[data-action="reload"]');
  const wait = overlay.querySelector('[data-action="wait"]');
  let phase = 'preparing', stage = '正在打开本地空间', disposed = false, restart, restarting = false;
  let skipped = preferences.startupAnimation === false, readyPending = false;
  let watchdog, exitTimer, brandTimer, initialized = false;
  // Approved brand sequence: 2980 ms reveal/read time + 220 ms exit.
  // This is decorative time, not fake initialization progress.
  const startedAt = performance.now(), brandDuration = 2980;
  overlay.dataset.startedAt = String(startedAt);
  const originalInert = app.inert;
  const previousFocus = document.activeElement;
  function updateMotion() {
    overlay.dataset.static = String(phase === 'failed' || skipped || motion.matches || preferences.reducedMotion === true || preferences.lowPerformance === true);
    skip.hidden = skipped || overlay.dataset.static === 'true';
    revealWhenReady();
  }
  function closeWindow() {
    Promise.resolve().then(() => window.studyRoomDesktop.closeWindow()).catch(() => {
      if (!disposed) detail.textContent = '关闭请求未完成，请重试或使用 Alt+F4。';
    });
  }
  function allowCloseDialog(target) { return target instanceof Element && Boolean(target.closest('.close-dialog[open]')); }
  function focusGuard(event) {
    if (!disposed && !overlay.contains(event.target) && !allowCloseDialog(event.target)) overlay.querySelector('button').focus();
  }
  function keys(event) {
    if (disposed || allowCloseDialog(event.target) || (event.altKey && event.key === 'F4')) return;
    // Stop application-level shortcuts without preventing native activation of our buttons.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); skipAnimation(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const controls = [...overlay.querySelectorAll('button:not(:disabled)')].filter(el => el.getClientRects().length > 0);
      const current = controls.indexOf(document.activeElement);
      controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }
  }
  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (disposed || phase !== 'preparing') return;
      status.textContent = '启动尚未完成';
      detail.textContent = stage + '；可以继续等待，或保存后重试。';
      actions.hidden = false;
    }, 15000);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(watchdog); clearTimeout(exitTimer); clearTimeout(brandTimer);
    window.removeEventListener('keydown', keys, true);
    document.removeEventListener('focusin', focusGuard, true);
    window.removeEventListener('error', startupError);
    motion.removeEventListener('change', updateMotion);
    const returnFocus = overlay.contains(document.activeElement);
    overlay.remove(); app.inert = originalInert;
    if (returnFocus && !originalInert) {
      const target = previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected
        ? previousFocus : app.querySelector('main, h1, h2') || app;
      const oldTab = target.getAttribute('tabindex');
      target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
      if (oldTab === null) target.removeAttribute('tabindex'); else target.setAttribute('tabindex', oldTab);
    }
    restart = undefined;
  }
  function fail(message) {
    if (disposed || phase === 'revealing') return;
    phase = 'failed'; overlay.dataset.state = phase;
    clearTimeout(watchdog); clearTimeout(brandTimer); updateMotion(); status.textContent = message;
    detail.textContent = '没有清除本机数据。请保存后重试，或正常关闭客户端。';
    actions.hidden = false; wait.hidden = true;
  }
  function startupError(event) { if (event instanceof ErrorEvent) fail('启动界面遇到错误'); }
  function skipAnimation() { skipped = true; updateMotion(); }
  function ready() {
    if (disposed || phase !== 'preparing') return;
    if (restarting) { readyPending = true; return; }
    initialized = true; clearTimeout(watchdog);
    status.textContent = '本地空间已就绪';
    detail.textContent = '即将进入，也可以跳过动画';
    revealWhenReady();
  }
  function revealWhenReady() {
    if (disposed || phase !== 'preparing' || !initialized || restarting) return;
    clearTimeout(brandTimer);
    const remaining = overlay.dataset.static === 'true' ? 0 : Math.max(0, brandDuration - (performance.now() - startedAt));
    if (remaining > 0) { brandTimer = setTimeout(revealWhenReady, remaining); return; }
    phase = 'revealing'; overlay.dataset.state = phase; clearTimeout(watchdog);
    exitTimer = setTimeout(dispose, overlay.dataset.static === 'true' ? 140 : 220);
  }
  overlay.querySelector('.moyu-startup__close').addEventListener('click', closeWindow);
  overlay.querySelector('[data-action="quit"]').addEventListener('click', closeWindow);
  skip.addEventListener('click', skipAnimation);
  wait.addEventListener('click', () => { actions.hidden = true; status.textContent = stage; detail.textContent = '准备好后自动进入'; armWatchdog(); });
  reload.addEventListener('click', async () => {
    if (!restart || restarting) return;
    restarting = true; reload.disabled = true;
    try { await restart(); } catch { detail.textContent = '本机保存尚未完成，暂不能重新加载。请继续等待或正常关闭客户端。'; }
    finally { restarting = false; reload.disabled = false; if (readyPending) ready(); }
  });
  updateMotion(); app.inert = true; document.body.append(overlay);
  window.addEventListener('keydown', keys, true);
  document.addEventListener('focusin', focusGuard, true);
  window.addEventListener('error', startupError);
  motion.addEventListener('change', updateMotion);
  armWatchdog();
  window.moyuStartupOverlay = Object.freeze({
    get active() { return !disposed; },
    get runtimeBound() { return Boolean(restart) || disposed; },
    stage(message) { if (!disposed && phase === 'preparing' && !initialized) { stage = message; status.textContent = message; } },
    fail,
    ready,
    bindRestart(handler) { if (!disposed) { restart = handler; reload.hidden = false; } },
    dispose,
  });
})();
