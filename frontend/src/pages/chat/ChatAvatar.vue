<template>
  <span class="chat-avatar" aria-hidden="true">
    <img v-if="source && !failed" :src="source" alt="" @error="failed = true" />
    <AppIcon v-else :name="hall ? 'chat' : 'user'" />
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '../../components/icons/AppIcon.vue';
import { cloudMediaUrl } from '../../utils/cloudMedia';
const props = defineProps<{ url?: string | null; hall?: boolean }>();
const source = computed(() => cloudMediaUrl(props.url));
const failed = ref(false);
watch(source, () => { failed.value = false; });
</script>
<style scoped>
.chat-avatar{display:grid;place-items:center;flex:none;width:40px;height:40px;overflow:hidden;border:1px solid var(--sr-color-line);border-radius:12px;background:var(--sr-color-selected);color:var(--sr-color-text-muted)}
.chat-avatar img{display:block;width:100%;height:100%;object-fit:cover}
</style>
