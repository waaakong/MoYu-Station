<template>
  <div class="auth-field">
    <label :for="id">{{ label }}</label>
    <span class="password-control" @focusout="leaveControl">
      <input
        :id="id"
        ref="input"
        :value="modelValue"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        :aria-errormessage="error ? `${id}-error` : undefined"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keydown="updateCapsLock"
        @keyup="updateCapsLock"
        @blur="capsLock = false"
      />
      <button type="button" :disabled="disabled" :aria-label="visible ? '隐藏密码' : '显示密码'" @click="visible = !visible">
        {{ visible ? "隐藏" : "显示" }}
      </button>
    </span>
    <small v-if="capsLock" :id="`${id}-caps`" class="auth-field__caps" role="status">大写锁定已开启</small>
    <small v-if="error" :id="`${id}-error`" class="auth-field__error" role="alert">{{ error }}</small>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";

defineEmits<{ (event: "update:modelValue", value: string): void }>();

const visible = ref(false);
const capsLock = ref(false);
const input = ref<HTMLInputElement | null>(null);
const props = withDefaults(defineProps<{
  id: string;
  label: string;
  modelValue: string;
  autocomplete: string;
  placeholder?: string;
  maxlength?: number;
  disabled?: boolean;
  error?: string;
}>(), { placeholder: "", maxlength: 128, error: "" });
const describedBy = computed(() => [capsLock.value ? `${props.id}-caps` : "", props.error ? `${props.id}-error` : ""].filter(Boolean).join(" ") || undefined);
function updateCapsLock(event: KeyboardEvent) { capsLock.value = event.getModifierState("CapsLock"); }
function conceal() { visible.value = false; capsLock.value = false; }
function leaveControl(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) conceal();
}
function visibilityChanged() { if (document.hidden) conceal(); }
onMounted(() => { window.addEventListener('blur', conceal); document.addEventListener('visibilitychange', visibilityChanged); });
onBeforeUnmount(() => { conceal(); window.removeEventListener('blur', conceal); document.removeEventListener('visibilitychange', visibilityChanged); });
defineExpose({ focus: () => input.value?.focus() });
</script>

<style scoped>
.auth-field { display: grid; gap: 8px; margin-bottom: 14px; }
.auth-field > label { color: rgba(255,255,255,.66); font-size: 12px; font-weight: 900; }
.password-control { position: relative; display: block; }
input { width: 100%; height: 48px; padding: 0 66px 0 15px; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; outline: 0; background: rgba(255,255,255,.08); color: #fff; font-size: 14px; transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease; }
input:focus { border-color: rgba(255,255,255,.38); background: rgba(255,255,255,.12); box-shadow: 0 0 0 4px rgba(255,255,255,.08); }
input[aria-invalid="true"] { border-color: rgba(255,190,150,.62); }
button { position: absolute; top: 50%; right: 10px; min-height: 32px; padding: 0 8px; border: 0; border-radius: 9px; transform: translateY(-50%); background: transparent; color: rgba(255,255,255,.68); font-size: 11px; font-weight: 900; cursor: pointer; }
button:hover { color: #fff; background: rgba(255,255,255,.08); }
.auth-field__error { color: rgba(255,226,196,.96); font-size: 11px; font-weight: 800; line-height: 1.45; }
.auth-field__caps { color: rgba(255,235,174,.94); font-size: 11px; font-weight: 800; line-height: 1.45; }
</style>
<style scoped>
.auth-field > label { color:var(--sr-color-text-muted); font-size:13px; font-weight:500; }
input { border-radius:var(--sr-radius-control); border-color:var(--sr-color-line-strong); background:var(--sr-color-surface-solid); font-size:16px; }
input::placeholder { color:var(--sr-color-text-muted); }
input:focus { border-color:var(--sr-color-focus); outline:2px solid var(--sr-color-focus); outline-offset:2px; box-shadow:none; }
button { min-width:44px; min-height:44px; right:4px; color:var(--sr-color-text-muted); font-size:12px; font-weight:500; }
.auth-field__error,.auth-field__caps { font-size:12px; font-weight:500; }
@media(hover:none) { button:hover { background:transparent; } }
</style>
