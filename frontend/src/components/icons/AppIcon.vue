<template><svg class="sr-icon" :class="{ 'sr-icon--solid': solidIcons.has(name) }" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="iconPaths[name]" /></svg></template>
<script setup lang="ts">
import { iconPaths, solidIcons, type IconName } from './paths';
defineProps<{name: IconName}>();
</script>
<style>
.sr-icon{display:inline-block;width:20px;height:20px;flex:none;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.sr-icon.sr-icon--solid{fill:currentColor;stroke:none}
</style>
