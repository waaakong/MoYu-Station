<template>
  <label class="auth-field" :for="id">
    <span :id="`${id}-label`">{{ label }}</span>
    <input
      :id="id"
      ref="input"
      v-bind="$attrs"
      :value="modelValue"
      :type="type"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :aria-invalid="Boolean(error)"
      :aria-labelledby="`${id}-label`"
      :aria-describedby="error ? `${id}-error` : undefined"
      :aria-errormessage="error ? `${id}-error` : undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <small v-if="error" :id="`${id}-error`" class="auth-field__error" role="alert">{{ error }}</small>
  </label>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{
  id: string;
  label: string;
  modelValue: string;
  type?: string;
  autocomplete?: string;
  placeholder?: string;
  error?: string;
}>(), {
  type: "text",
  autocomplete: "off",
  placeholder: "",
  error: ""
});

defineEmits<{ (event: "update:modelValue", value: string): void }>();
const input = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<style scoped>
.auth-field { display: grid; gap: 8px; margin-bottom: 14px; }
.auth-field > span { color: rgba(255,255,255,.66); font-size: 12px; font-weight: 900; }
input { width: 100%; height: 48px; padding: 0 15px; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; outline: 0; background: rgba(255,255,255,.08); color: #fff; font-size: 14px; transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease; }
input:focus { border-color: rgba(255,255,255,.38); background: rgba(255,255,255,.12); box-shadow: 0 0 0 4px rgba(255,255,255,.08); }
input[aria-invalid="true"] { border-color: rgba(255,190,150,.62); }
.auth-field__error { color: rgba(255,226,196,.96); font-size: 11px; font-weight: 800; line-height: 1.45; }
</style>
<style scoped>
.auth-field > span { color:var(--sr-color-text-muted); font-size:13px; font-weight:500; }
input { border-radius:var(--sr-radius-control); border-color:var(--sr-color-line-strong); background:var(--sr-color-surface-solid); font-size:16px; }
input::placeholder { color:var(--sr-color-text-muted); }
input:focus { border-color:var(--sr-color-focus); outline:2px solid var(--sr-color-focus); outline-offset:2px; box-shadow:none; }
.auth-field__error { font-size:12px; font-weight:500; }
</style>
