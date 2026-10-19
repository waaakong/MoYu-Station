<template><AppIcon :name="kind" class="transport-glyph" /></template>
<script setup lang="ts">
import AppIcon from '../icons/AppIcon.vue';
defineProps<{kind:'play'|'pause'|'previous'|'next'}>();
</script>
<style scoped>.transport-glyph{width:20px;height:20px}</style>
