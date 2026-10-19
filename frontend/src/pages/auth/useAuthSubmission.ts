import { computed, onBeforeUnmount, ref } from 'vue';

/** A wall-clock deadline; suspended tabs must not extend the server's retry delay. */
export function useAuthSubmission() {
  const pending = ref(false);
  const retryUntil = ref(0);
  const now = ref(Date.now());
  let alive = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  const remaining = computed(() => Math.max(0, Math.ceil((retryUntil.value - now.value) / 1000)));
  function begin() {
    now.value = Date.now();
    if (!alive || pending.value || remaining.value) return false;
    pending.value = true;
    return true;
  }
  function rateLimit(seconds: unknown) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return;
    now.value = Date.now();
    retryUntil.value = Math.max(retryUntil.value, now.value + Math.ceil(value) * 1000);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      now.value = Date.now();
      if (!remaining.value && timer) { clearInterval(timer); timer = undefined; }
    }, 250);
  }
  onBeforeUnmount(() => { alive = false; if (timer) clearInterval(timer); });
  return { pending, retryUntil, remaining, begin, rateLimit, isAlive: () => alive };
}
