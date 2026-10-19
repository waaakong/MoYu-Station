<template>
  <Teleport to="body"><dialog ref="dialog" class="sticker-panel sr-glass sr-glass--floating" aria-label="表情面板" @cancel.prevent="close">
    <header><h2>表情</h2><button type="button" @click="close">关闭</button></header>
    <nav aria-label="表情分类"><button v-for="item in tabs" :key="item" type="button" :aria-pressed="tab===item" @click="tab=item">{{ item }}</button></nav>
    <section class="sticker-content">
      <template v-if="tab!=='我的收藏'">
        <p v-if="tab==='最近' && !recent.length">使用过的文字表情会保存在本机。</p>
        <p v-if="tab==='内置'">内置文字表情</p>
        <div class="emoji-grid"><button v-for="text in choices" :key="text" type="button" :aria-label="`插入 ${text}`" @click="insert(text)">{{ text }}</button></div>
      </template>
      <template v-else>
        <p v-if="state.loading" role="status">正在同步收藏…</p>
        <p v-else-if="!state.enabled">当前服务未开放表情收藏。Emoji 和内置文字表情仍可使用。</p>
        <template v-else>
          <div class="collection-actions"><label class="upload-sticker">上传表情<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="upload" /></label><button type="button" @click="api.refresh">刷新收藏</button><span>{{ state.collection.items.length }} / 200</span></div>
          <p>GIF 最多 5 MiB、120 帧、15 秒；静态图由现有图片处理器校验。</p>
          <div v-if="state.orderIntent" class="order-notice"><span>{{ state.orderConflict ? '另一端或请求结果有变化，请重新确认顺序。' : '顺序尚未保存。' }}</span><button type="button" @click="api.saveOrder">{{ state.orderConflict ? '重新确认并保存排序' : '保存排序' }}</button></div>
          <div v-for="job in state.jobs" :key="job.id" class="job" role="status">{{ job.state==='working' ? '正在处理收藏…' : job.error }}<button v-if="job.state!=='working'" type="button" @click="api.run(job)">重试原收藏任务</button></div>
          <p v-if="!state.collection.items.length">还没有收藏。可以上传，或收藏有权查看的聊天图片。</p>
          <div class="favorites-grid"><article v-for="(item,index) in api.ordered()" :key="item.id">
            <button class="favorite-send" type="button" :aria-label="`发送收藏表情 ${index+1}`" @click="$emit('favorite',item)">
              <AnimatedSticker v-if="item.mime==='image/gif'" :clear-url="item.clearUrl" :poster-url="item.thumbUrl" :width="item.width" :height="item.height" :alt="`收藏表情 ${index+1}`" />
              <img v-else :src="assetUrl(item.thumbUrl)" :alt="`收藏表情 ${index+1}`" loading="lazy" />
            </button>
            <div><button type="button" :disabled="index===0" :aria-label="`前移收藏 ${index+1}`" @click="api.move(item.id,-1)">前移</button><button type="button" :disabled="index===state.collection.items.length-1" :aria-label="`后移收藏 ${index+1}`" @click="api.move(item.id,1)">后移</button><button type="button" :aria-label="`删除收藏 ${index+1}`" @click="api.remove(item.id)">删除</button></div>
          </article></div>
        </template>
      </template>
      <p v-if="!textOnly && state.error" role="alert">{{ state.error }}</p>
    </section>
  </dialog></Teleport>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../motion/runtime';
import { computed,onBeforeUnmount,onMounted,ref } from 'vue';
import type { StickerFavorite } from '@studyroom/contracts';
import { stickerApi } from './api';
import { stickerSession as state } from './session';
import AnimatedSticker from '../components/media/AnimatedSticker.vue';
import { cloudMediaUrl as assetUrl } from '../utils/cloudMedia';
const emit=defineEmits<{close:[];insert:[text:string];favorite:[item:StickerFavorite]}>();
const props=defineProps<{textOnly?:boolean}>();
const api=stickerApi(),dialog=ref<HTMLDialogElement>(),tabs=computed(()=>props.textOnly?['最近','Emoji','内置']:['最近','Emoji','内置','我的收藏']),tab=ref('Emoji'),recent=ref<string[]>([]);
const emoji=['😀','😊','😂','🥹','🥰','😎','🤔','😴','😭','🥳','👍','👏','🙏','💪','❤️','✨','🌿','☕','📚','🌙','🎉','✅','🔥','👋'];
const builtin=['( •̀ ω •́ )✧','٩(ˊᗜˋ*)و','(｡･ω･｡)ﾉ♡','(つд⊂)','(￣▽￣)ノ','( ˘ω˘ )'];
const choices=computed(()=>tab.value==='最近'?recent.value:tab.value==='内置'?builtin:emoji);
function insert(text:string){recent.value=[text,...recent.value.filter(item=>item!==text)].slice(0,32);try{localStorage.setItem('studyroom-recent-text-emoji-v1',JSON.stringify(recent.value));}catch{/* memory remains usable */}emit('insert',text);}
function upload(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file){try{api.add(file);}catch(error){state.error=String(error);}}input.value='';}
function foreground(){if(!props.textOnly && document.visibilityState==='visible')void api.refresh();}
let trigger:HTMLElement|null=null;
function close(){closeMotionDialog(dialog.value,false,()=>emit('close'));}
onMounted(()=>{trigger=document.activeElement as HTMLElement;try{const parsed=JSON.parse(localStorage.getItem('studyroom-recent-text-emoji-v1')||'[]');if(Array.isArray(parsed))recent.value=parsed.filter(item=>typeof item==='string' && [...emoji,...builtin].includes(item)).slice(0,32);}catch{/* invalid preferences are not media */}openMotionDialog(dialog.value);foreground();document.addEventListener('visibilitychange',foreground);window.addEventListener('studyroom:stickers-invalidated',foreground);});
onBeforeUnmount(()=>{closeMotionDialog(dialog.value, true);trigger?.focus();document.removeEventListener('visibilitychange',foreground);window.removeEventListener('studyroom:stickers-invalidated',foreground);});
</script>
<style scoped>
.sticker-panel{box-sizing:border-box;width:min(540px,calc(100vw - 24px));max-height:min(640px,85dvh);padding:0;border:1px solid #ffffff36;border-radius:18px;background:#202a24;color:#f0f2ec;box-shadow:0 24px 80px #0008}.sticker-panel::backdrop{background:#0007}header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px}h2{font-size:18px;margin:0}nav{display:flex;padding:0 12px 12px;border-bottom:1px solid #ffffff20}button,.upload-sticker{min-height:36px;padding:6px 12px;border:1px solid #ffffff26;border-radius:8px;background:#ffffff0c;color:inherit;font:inherit;font-size:12px;cursor:pointer}button:disabled{opacity:.4;cursor:default}button:focus-visible,.upload-sticker:focus-within{outline:2px solid #e1d2af;outline-offset:2px}nav button{flex:1;border:0}nav button[aria-pressed=true]{background:#e1d2af;color:#202a24}.sticker-content{padding:16px;max-height:55dvh;overflow:auto}p,.order-notice{font-size:12px;line-height:1.7;color:#c6cec7}.emoji-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.emoji-grid button{font-size:23px;min-height:48px;overflow-wrap:anywhere}.collection-actions{display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap}.upload-sticker{position:relative;display:flex;align-items:center;overflow:hidden}.upload-sticker input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.favorites-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.favorites-grid article{min-width:0}.favorite-send{width:100%;aspect-ratio:1;display:grid;place-items:center}.favorite-send img{width:100%;height:100%;object-fit:contain;max-height:120px}.favorites-grid article>div{display:flex;flex-wrap:wrap;margin-top:4px}.favorites-grid article>div button{font-size:11px;padding:4px 6px;flex:1}.job{padding:10px;font-size:12px;line-height:1.6;background:#ffffff0c;margin:8px 0}.job button{display:block;margin-top:4px}
</style>
<style scoped>
.sticker-panel{border-radius:var(--sr-radius-panel);border-color:var(--sr-color-line-strong);background:var(--sr-color-surface-solid);color:var(--sr-color-text)}
header{padding:16px 20px}h2{font-weight:650}
button,.upload-sticker{min-height:44px;border-radius:var(--sr-radius-control);font-size:13px;transition:background-color var(--sr-motion-fast) ease,color var(--sr-motion-fast) ease}
nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0 16px 12px;padding:4px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:rgba(0,0,0,.18)}
nav button{padding:4px;white-space:nowrap;font-size:13px;background:transparent;color:var(--sr-color-text-muted)}
nav button[aria-pressed=true]{background:var(--sr-color-selected);color:var(--sr-color-text);box-shadow:0 1px 3px #0002}
button:focus-visible,.upload-sticker:focus-within{outline-color:var(--sr-color-focus)}
.sticker-content{overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(180,201,185,.3) transparent}
.emoji-grid button{border-color:transparent;background:transparent;min-height:52px}
.favorites-grid article>div{gap:2px}.favorites-grid article>div button{min-height:36px;flex:1}
@media(hover:hover) and (pointer:fine){.emoji-grid button:hover{background:var(--sr-color-selected)}}
@media(max-width:480px){.sticker-panel{max-height:85dvh}.emoji-grid{gap:2px}.emoji-grid button{padding:4px}.favorites-grid article>div button{min-height:44px;font-size:12px}.favorites-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
