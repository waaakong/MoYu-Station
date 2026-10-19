<template>
  <img ref="element" :src="assetUrl(playing && !failed ? clearUrl : posterUrl)" :alt="alt" :width="width" :height="height" decoding="async" @error="failed = true" />
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gifPlayback } from '../../media/gifPlayback';
import { cloudMediaUrl as assetUrl } from '../../utils/cloudMedia';
import { useShellStore } from '../../stores/shell';
defineProps<{ clearUrl:string;posterUrl:string;alt:string;width?:number;height?:number }>();
const element=ref<HTMLImageElement>(),playing=ref(false),failed=ref(false),shell=useShellStore();
const subscription=gifPlayback.register(value=>{playing.value=value;});
let observer:IntersectionObserver|undefined, preference:MediaQueryList|undefined;
function policy(){gifPlayback.allow(document.visibilityState==='visible' && !preference?.matches && !shell.preferences.reducedMotion && !shell.preferences.lowPerformance);}
watch(()=>[shell.preferences.reducedMotion,shell.preferences.lowPerformance],policy);
onMounted(()=>{
  preference=matchMedia('(prefers-reduced-motion: reduce)');preference.addEventListener('change',policy);document.addEventListener('visibilitychange',policy);policy();
  observer=new IntersectionObserver(entries=>{subscription.visible(entries.some(entry=>entry.isIntersecting && entry.intersectionRatio>=.5));},{threshold:[0,.5]});
  if(element.value)observer.observe(element.value);
});
onBeforeUnmount(()=>{observer?.disconnect();subscription.dispose();preference?.removeEventListener('change',policy);document.removeEventListener('visibilitychange',policy);element.value?.removeAttribute('src');});
</script>
