<template>
  <Teleport to="body">
    <dialog ref="dialog" class="sr-overlay-dialog" :class="`sr-overlay-dialog--${placement}`"
      :aria-label="label" :role="alert ? 'alertdialog' : 'dialog'"
      @cancel.prevent.stop="emit('close')" @click.self="emit('close')" @close="!dialog?.open && emit('closed')">
      <slot v-if="rendered" />
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { closeMotionDialog, openMotionDialog } from '../../motion/runtime';
import { useAuthStore } from '../../stores/auth';
const props = withDefaults(defineProps<{ open: boolean; label: string; placement?: 'center' | 'right'; alert?: boolean }>(), { placement: 'center' });
const emit = defineEmits<{ close: []; closed: [] }>();
const dialog = ref<HTMLDialogElement>();
const rendered = ref(props.open);
const auth = useAuthStore();
let generation = 0, disposed = false;
async function sync() {
  const current = ++generation;
  if (props.open) { rendered.value = true; await nextTick(); }
  if (disposed || current !== generation) return;
  if (!dialog.value?.isConnected) return;
  if (props.open) openMotionDialog(dialog.value, props.placement);
  else closeMotionDialog(dialog.value, false, () => { if (!props.open && current === generation) rendered.value = false; });
}
watch(() => props.open, sync, { flush: 'post' });
watch(() => auth.sessionGeneration, () => { ++generation; rendered.value = false; closeMotionDialog(dialog.value, true); emit('close'); }, { flush: 'sync' });
onMounted(sync);
onBeforeUnmount(() => { disposed = true; ++generation; closeMotionDialog(dialog.value, true); });
</script>

<style scoped>
/* The top layer escapes page containment, glass and route-motion stacking contexts. */
.sr-overlay-dialog{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:16px;border:0;border-radius:0;box-sizing:border-box;background:transparent;color:var(--sr-color-text);overflow:hidden;-webkit-app-region:no-drag}
.sr-overlay-dialog[open]{display:flex;align-items:center;justify-content:center}
.sr-overlay-dialog::backdrop{background:rgba(3,8,5,.58)}
.sr-overlay-dialog--right{padding:12px}
.sr-overlay-dialog--right[open]{align-items:stretch;justify-content:flex-end}
.sr-overlay-dialog :slotted(*){max-width:100%;max-height:100%;box-sizing:border-box;overflow:auto;overscroll-behavior:contain}
</style>
