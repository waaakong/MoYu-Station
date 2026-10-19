<template><svg class="sr-brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M13 51V26a19 19 0 0 1 38 0v25q0 6-6 6H19q-6 0-6-6Z" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M18 41c5-2 6-6 10-7 3-1 6-9 10-9 4 0 3 6 6 9l5 7Z" fill="currentColor"/><path v-if="!small" d="M26 47h14" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></template>
<script setup lang="ts">defineProps<{small?:boolean}>();</script>
<style>.sr-brand-mark{display:inline-block;width:32px;height:32px;flex:none;vertical-align:middle;pointer-events:none}</style>
