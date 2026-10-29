<template>
  <section v-if="desktop" class="desktop-music-entry"><div><strong>桌面歌词与快捷轮盘</strong><p>外观、颜色及快捷键已移至客户端设置。</p></div><RouterLink :to="{name:'profile',query:{module:'client-settings'}}">打开客户端设置</RouterLink></section>
</template>
<script setup lang="ts">
import {RouterLink} from 'vue-router';
const desktop=Boolean(window.studyRoomDesktop);
</script>
<style scoped>
.desktop-music-entry{border-top:1px solid var(--sr-color-line);padding:18px 0;display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px}.desktop-music-entry strong{font-weight:550}.desktop-music-entry p{margin:7px 0 0;color:var(--sr-color-text-muted);font-size:11px}.desktop-music-entry a{padding:10px 13px;border:1px solid var(--sr-color-line);border-radius:11px;color:inherit;text-decoration:none;background:var(--sr-color-surface-raised);white-space:nowrap}@media(max-width:600px){.desktop-music-entry{flex-wrap:wrap}}
</style>
