<template>
  <div v-if="source && picture" class="private-background" aria-hidden="true" :data-private-scene="state.saved?.version">
    <img v-if="picture.fit==='contain'" class="fill" :src="source" alt="" />
    <img :key="source" class="image" :src="source" alt="" :style="{objectFit:picture.fit,objectPosition:`${picture.focalX*100}% ${picture.focalY*100}%`,transform:`scale(${picture.fit==='contain'?1:picture.zoom})`}" @error="failed=source" />
    <div :style="{background:`rgba(0,0,0,${picture.dim})`}"></div>
  </div>
</template>
<script setup lang="ts">
import { sameEntityId } from "@studyroom/contracts";
import {computed,ref,watch} from 'vue';
import {privateScene as state} from '../../scenes/privateSession';
import {useAuthStore} from '../../stores/auth';
import {useSceneStore} from '../../stores/scene';
import {cloudMediaUrl} from '../../utils/cloudMedia';
const auth=useAuthStore(),scene=useSceneStore(),failed=ref('');
const picture=computed(()=>state.active && sameEntityId(state.owner,auth.user?.id) && !auth.authTransition && !auth.isBanned?state.saved?.config?.periods[scene.timeKey]||state.saved?.config?.defaultImage:null);
const url=computed(()=>picture.value?state.cachedUrls[picture.value.assetId]||cloudMediaUrl(`/api/media/assets/${picture.value.assetId}/display`):'');
const source=computed(()=>url.value!==failed.value?url.value:'');
watch(()=>[state.saved?.version,auth.sessionGeneration],()=>failed.value='');
</script>
<style scoped>
.private-background,.private-background img,.private-background>div{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.private-background{z-index:1;overflow:hidden;background:#101513}.fill{object-fit:cover;filter:blur(26px);transform:scale(1.12);opacity:.65}.image{transform-origin:center}
</style>
