<template>
  <span ref="root" class="track-cover" :data-artwork-state="url&&!failed?'image':'fallback'">
    <img v-if="url&&!failed" :key="imageKey+url" :src="url" alt="" :loading="resolve?'eager':'lazy'" draggable="false" @error="onError" />
    <slot v-else><AppIcon name="music" /></slot>
  </span>
</template>
<script setup lang="ts">
import {computed,nextTick,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import type {Track,ProviderId,ProviderPlaylistSummary} from '@studyroom/contracts';
import {useProvidersStore} from '../../stores/providers';
import {useQueueStore} from '../../stores/queue';
import {loadProviderArtwork,loadPlaylistArtwork} from '../../audio/artworkLoader';
const props=defineProps<{track?:Track;src?:string;providerId?:ProviderId;playlist?:ProviderPlaylistSummary;resolve?:boolean}>();
const providers=useProvidersStore(),queue=useQueueStore();
const url=ref(''),failed=ref(false);
const imageKey=ref(0);
const root=ref<HTMLElement>(),visible=ref(false);let observer:IntersectionObserver|undefined;
onMounted(()=>{if(!props.playlist)return;observer=new IntersectionObserver(entries=>{visible.value=entries.some(e=>e.isIntersecting);},{rootMargin:'80px'});if(root.value)observer.observe(root.value);});
onBeforeUnmount(()=>observer?.disconnect());
let generation=0,repaired=false;
const providerId=computed(()=>props.track?.source.kind==='provider'?props.track.source.providerId:props.providerId);
const localArtwork=(value:unknown):value is string=>typeof value==='string'&&/^studyroom-media:\/\/provider-artwork\/[a-f0-9]{64}$/.test(value);
watch(()=>[props.track?.id,props.track?.source.kind==='provider'?props.track.source.trackId:'',props.track?.artworkUrl,props.src,props.playlist?.id,visible.value,props.resolve,providerId.value,providers.identityEpoch,providers.statuses.find(s=>s.providerId===providerId.value)?.state],async(_,__,cleanup)=>{
  generation++;imageKey.value++;repaired=false;
  let active=true;cleanup(()=>{active=false;generation++;});url.value='';failed.value=false;
  const track=props.track,id=providerId.value,status=providers.statuses.find(s=>s.providerId===id);
  if(id&&(!window.studyRoomDesktop||!status?.enabled||status.state==='expired'))return;
  const source=props.src??track?.artworkUrl;
  if(source&&(!id||localArtwork(source))){url.value=source;return;}
  if(props.playlist&&visible.value&&window.studyRoomDesktop?.getProviderPlaylistArtwork){
    try{const result=await loadPlaylistArtwork({providerId:props.playlist.providerId,playlistId:props.playlist.id},providers.identityEpoch,()=>active);if(active&&localArtwork(result))url.value=result;}catch{}
    return;
  }
  if(!props.resolve||track?.source.kind!=='provider'||!window.studyRoomDesktop?.getProviderArtwork)return;
  try{
    const result=await loadProviderArtwork({providerId:track.source.providerId,trackId:track.source.trackId},providers.identityEpoch);
    if(!active||!localArtwork(result))return;
    url.value=result;
    // Persist metadata only; never start/seek/recreate the audio session.
    if(queue.items.some(i=>i.track===track))void queue.updateArtwork(track,result).catch(()=>{});
  }catch{/* Artwork is optional and must not surface as a playback failure. */}
},{immediate:true});
async function onError(event:Event){
  if((event.target as HTMLImageElement).getAttribute('src')!==url.value)return;
  failed.value=true;
  const track=props.track,current=generation;
  if(repaired||!props.resolve||track?.source.kind!=='provider'||!window.studyRoomDesktop?.getProviderArtwork)return;
  repaired=true;
  try{
    const result=await loadProviderArtwork({providerId:track.source.providerId,trackId:track.source.trackId},providers.identityEpoch);
    if(generation!==current||!localArtwork(result))return;
    // Recreate the failed image node even if the refreshed token is identical.
    await nextTick();if(generation!==current)return;url.value=result;failed.value=false;
    if(track.artworkUrl!==result&&queue.items.some(i=>i.track===track))void queue.updateArtwork(track,result).catch(()=>{});
  }catch{/* Keep the fallback without a retry loop. */}
}
</script>
<style scoped>
.track-cover{display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;border-radius:inherit}.track-cover>img{display:block;width:100%;height:100%;object-fit:cover}
</style>
