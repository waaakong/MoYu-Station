<template>
  <section class="memory-tool">
    <header><div><h2>摸鱼翻翻牌</h2><p>找出六对相同图形，不计分，也不排行。</p></div><div class="meta"><span>{{ store.memoryCards.moves }} 步</span><button class="sr-glass-control" type="button" @click="start">重新开始</button></div></header>
    <div v-if="!store.memoryCards.cards.length" class="empty"><button class="sr-glass-control" type="button" @click="start">开始一局</button></div>
    <div v-else class="cards" :class="{ quiet: reducedMotion || keyboardActivation }" role="grid" aria-label="翻牌区域">
      <button v-for="(card,index) in store.memoryCards.cards" :key="card.id" role="gridcell" type="button" :disabled="paused || store.memoryCards.revealedIds.length >= 2 || card.matched" :aria-label="card.matched || isRevealed(card.id) ? `卡片 ${card.symbol}` : `第 ${index + 1} 张未翻开卡片`" :class="{ open: card.matched || isRevealed(card.id), matched: card.matched }" @click="reveal(card.id,$event)"><span class="back">墨</span><span class="front">{{ card.symbol }}</span></button>
    </div>
    <div v-if="store.memoryCards.status === 'completed'" class="complete"><strong>六对都找到了</strong><button class="sr-glass-control" type="button" @click="start">再来一局</button></div>
    <div v-else-if="store.memoryCards.status === 'paused' && !paused" class="complete"><strong>这一局已暂停</strong><button class="sr-glass-control" type="button" @click="store.resumeMemory()">继续</button></div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { entertainmentAudio } from "../../entertainment/audioController";
import { useEntertainmentStore } from "../../stores/entertainment";
const props = defineProps<{ paused: boolean; reducedMotion: boolean }>();
const store = useEntertainmentStore();
let resolveTimer = 0;
const keyboardActivation = ref(false);
function start() { window.clearTimeout(resolveTimer); store.startMemoryGame(); void entertainmentAudio.play("tap"); }
function isRevealed(id: string) { return store.memoryCards.revealedIds.includes(id); }
function reveal(id: string,event:MouseEvent) { keyboardActivation.value=event.detail===0;store.revealMemory(id); void entertainmentAudio.play("tap"); if (store.memoryCards.revealedIds.length === 2) { window.clearTimeout(resolveTimer); resolveTimer = window.setTimeout(() => { store.resolveMemory(); if (store.memoryCards.status === "completed") void entertainmentAudio.play("success"); }, props.reducedMotion ? 120 : 620); } }
watch(() => props.paused, (paused) => { if (paused) window.clearTimeout(resolveTimer); });
onBeforeUnmount(() => window.clearTimeout(resolveTimer));
</script>

<style scoped>
.memory-tool{position:relative;display:grid;grid-template-rows:auto 1fr;gap:20px;height:100%;padding:clamp(24px,3.2vw,48px)}header{display:flex;align-items:end;justify-content:space-between;gap:20px}h2{margin:0 0 6px;font:500 40px var(--sr-font-display)}header p{margin:0;color:rgba(255,255,255,.6)}.meta{display:flex;align-items:center;gap:14px}.meta span{color:rgba(255,255,255,.64)}.meta button,.empty button,.complete button{height:38px;padding:0 16px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.09);color:#fff;font:800 12px var(--sr-font-sans);cursor:pointer}.cards{display:grid;grid-template-columns:repeat(6,minmax(70px,1fr));grid-template-rows:repeat(2,minmax(120px,1fr));gap:12px;min-height:0}.cards>button{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:rgba(16,22,20,.7);color:#eef3ed;font:500 34px var(--sr-font-display);transform-style:preserve-3d;transition:transform 380ms cubic-bezier(.22,1,.36,1),border-color 200ms ease;cursor:pointer}.cards>button:hover{border-color:rgba(255,255,255,.48)}.cards>button.open{transform:rotateY(180deg);border-color:rgba(202,226,212,.55)}.cards>button.matched{opacity:.64}.front,.back{position:absolute;inset:0;display:grid;place-items:center;backface-visibility:hidden}.front{transform:rotateY(180deg);background:rgba(147,177,158,.18)}.back{color:rgba(255,255,255,.35)}.quiet>button{transition:none}.empty{display:grid;place-items:center}.complete{position:absolute;z-index:2;inset:50% auto auto 50%;display:flex;align-items:center;gap:14px;padding:16px 20px;border:1px solid rgba(255,255,255,.2);border-radius:18px;background:rgba(16,22,20,.94);transform:translate(-50%,-50%);box-shadow:0 22px 70px rgba(0,0,0,.4)}@media(max-width:1050px){.cards{grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,110px);overflow:auto}}
.memory-tool{padding:clamp(16px,3vw,36px);box-sizing:border-box;min-height:0;overflow:auto}h2{font-size:clamp(28px,3vw,40px)}header p{font-size:13px;color:var(--sr-color-text-muted);line-height:1.7}.meta button,.empty button,.complete button{min-height:44px;height:44px;border-radius:var(--sr-radius-control,12px);font-weight:600;white-space:nowrap}.cards{grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(2,minmax(110px,1fr))}.cards>button{border-radius:var(--sr-radius-panel,20px);transition:transform 200ms var(--sr-ease-out),border-color 140ms ease}.cards>button:hover{border-color:var(--sr-color-line)}.cards>button:focus-visible,.meta button:focus-visible,.complete button:focus-visible,.empty button:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}.complete{max-width:calc(100% - 32px);box-sizing:border-box;border-radius:var(--sr-radius-panel,20px);background:#17251f}.complete strong{white-space:nowrap}.cards.quiet>button{transition:none}.cards.quiet .front,.cards.quiet .back{transform:none}.cards.quiet>button.open{transform:none}.cards.quiet>button.open .back,.cards.quiet>button:not(.open) .front{visibility:hidden}
@media(hover:hover) and (pointer:fine){.cards>button:hover:not(:disabled){border-color:var(--sr-color-line-strong)}}
@media(max-width:900px){header{align-items:start;flex-wrap:wrap}.cards{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(3,minmax(100px,1fr))}}
@media(max-width:520px){.memory-tool{padding:12px;gap:16px}.cards{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(4,100px);gap:8px}.meta{width:100%;justify-content:space-between}.complete{flex-wrap:wrap;justify-content:center;width:280px}.cards>button{font-size:28px}}
.meta span{color:var(--sr-color-text-muted)}
.cards>button{background:var(--sr-color-surface-solid);color:var(--sr-color-text);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
.cards>button.open{border-color:var(--sr-color-focus)}.front{background:var(--sr-color-surface-raised)}.back{color:var(--sr-color-text-faint)}
.complete{background:var(--sr-color-surface-solid);border-color:var(--sr-material-edge);box-shadow:var(--sr-material-shadow)}
</style>
