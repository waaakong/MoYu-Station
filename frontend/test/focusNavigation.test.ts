import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bindFocusNavigation, isFocusSpaceRoute } from '../src/focus/navigation';
import { useFocusStore } from '../src/stores/focus';
import { createFocusTimerSession } from '../src/focus/timer';

beforeEach(() => {
  setActivePinia(createPinia());
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } });
});
function session() {
  return createFocusTimerSession({ clientRecordId: crypto.randomUUID(), plannedMinutes: 25, sceneCode: 'forest', timeKey: 'morning' });
}
async function setup() {
  const names = ['scene', 'focus', 'sound', 'feed', 'chat', 'entertainment', 'profile', 'admin', 'login', 'welcome', 'download'];
  const router = createRouter({ history: createMemoryHistory(), routes: names.map(name => ({ name, path: '/' + name, component: { render() {} } })) });
  await router.push('/focus');
  const store = useFocusStore(); store.session = session();
  const stop = bindFocusNavigation(router);
  return { router, store, stop };
}
describe('committed space navigation', () => {
  it('allows only the three explicit space routes', () => {
    expect(['scene', 'focus', 'sound'].every(isFocusSpaceRoute)).toBe(true);
    expect([undefined, null, '', 'unknown', 'space'].some(isFocusSpaceRoute)).toBe(false);
  });
  it('keeps space navigation running, pauses outside, and never auto-resumes', async () => {
    const { router, store, stop } = await setup();
    const id = store.activeRecordId;
    for (const name of ['scene', 'sound', 'focus']) {
      await router.push('/' + name); expect(store.timerState).toBe('running');
    }
    for (const name of ['feed', 'chat', 'entertainment', 'profile', 'admin', 'login', 'welcome', 'download']) {
      await router.push('/' + name);
      expect(store.timerState).toBe('paused'); store.resume(); expect(store.timerState).toBe('paused');
      expect(store.activeRecordId).toBe(id);
      await router.push('/focus'); expect(store.timerState).toBe('paused');
      store.resume(); expect(store.timerState).toBe('running');
    }
    stop();
  });
  it('does not pause for cancelled navigation', async () => {
    const { router, store, stop } = await setup();
    router.beforeEach(to => to.name !== 'feed');
    await router.push('/feed'); expect(store.timerState).toBe('running'); stop();
  });
  it('rejects late starts and pauses hydration outside space', async () => {
    const store = useFocusStore(); store.setSpaceAllowed(false);
    await expect(store.start({ plannedMinutes: 25, sceneCode: 'forest', timeKey: 'morning' })).rejects.toThrow('返回空间');
    localStorage.setItem('studyroom-focus-session-v2', JSON.stringify(session()));
    store.hydrate(); expect(store.timerState).toBe('paused');
  });
});
