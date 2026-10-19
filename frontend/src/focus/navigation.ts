import { watch } from 'vue';
import type { Router } from 'vue-router';
import { useFocusStore } from '../stores/focus';

export function isFocusSpaceRoute(name: unknown): boolean {
  return name === 'scene' || name === 'focus' || name === 'sound';
}

/** Observe committed routes, not attempted navigation. Never resume on return. */
export function bindFocusNavigation(router: Router) {
  const focus = useFocusStore();
  return watch(() => router.currentRoute.value.name, name => {
    focus.setSpaceAllowed(isFocusSpaceRoute(name));
  }, { immediate: true, flush: 'sync' });
}
