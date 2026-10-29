<template>
  <section class="lyrics-panel" :class="{ 'lyrics-panel--compact': compact }" aria-label="歌词">
    <header v-if="!compact"><div><strong>歌词</strong><small>{{ sourceLabel }}</small></div><div><button type="button" aria-label="歌词提前半秒" :disabled="!state.lines.length || savingOffset" @click="changeOffset(-500)">−0.5</button><button type="button" :disabled="!state.lines.length || savingOffset" @click="changeOffset(0, true)">{{ formatOffset(state.offsetMs) }}</button><button type="button" aria-label="歌词延后半秒" :disabled="!state.lines.length || savingOffset" @click="changeOffset(500)">+0.5</button></div></header>
    <div v-if="state.loading" class="lyrics-panel__empty">正在读取歌词…</div>
    <div v-else-if="readFailed" class="lyrics-panel__empty" role="status">歌词读取失败或超时。<button type="button" @click="retrySharedLyrics">重试读取歌词</button></div>
    <div v-else-if="!track" class="lyrics-panel__empty">选择一首音乐后显示歌词。</div>
    <div v-else-if="!state.lines.length" class="lyrics-panel__empty">{{ track.source.kind === 'provider' ? '平台暂未提供可用的同步歌词。' : track.source.kind === 'local' ? '没有找到内嵌歌词或同名 LRC 文件。' : '此声音来源不提供同步歌词。' }}</div>
    <ol v-else class="lyrics-panel__lines">
      <li v-for="entry in visibleLines" :key="`${entry.line.timeMs}:${entry.index}`" :class="{ current: entry.index === state.currentIndex }">{{ entry.line.text || "·" }}</li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {usePlayerStore} from '../../stores/player';
import {useShellStore} from '../../stores/shell';
import {sharedLyricsState as state,sharedLyricsControls,retrySharedLyrics,saveSharedLyricsOffset} from '../../audio/lyrics/sharedLyricsRuntime';
defineProps<{compact?:boolean}>();
const player=usePlayerStore(),shell=useShellStore();
const track=computed(()=>player.currentItem?.track);
const readFailed=computed(()=>!!state.error),savingOffset=computed(()=>sharedLyricsControls.savingOffset);
const sourceLabel=computed(()=>state.source==='provider'?'平台同步歌词':state.source==='embedded'?'内嵌歌词':state.source==='sidecar'?'同名 LRC':track.value?.source.kind==='provider'?'平台同步歌词':'支持内嵌与同名 LRC');
const visibleLines=computed(()=>{
  const center=Math.max(0,state.currentIndex),start=Math.min(Math.max(0,center-2),Math.max(0,state.lines.length-5));
  return state.lines.slice(start,start+5).map((line,offset)=>({line,index:start+offset}));
});
async function changeOffset(delta:number,reset=false){
  await saveSharedLyricsOffset(delta,reset);
  if(sharedLyricsControls.offsetError)shell.toast(sharedLyricsControls.offsetError,'error');
}
function formatOffset(ms:number){return ms===0?'同步':`${ms>0?'+':''}${(ms/1000).toFixed(1)}s`;}
</script>

<style scoped>
.lyrics-panel{height:100%;display:flex;min-height:0;flex-direction:column}.lyrics-panel header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:13px;border-bottom:1px solid var(--sr-color-line)}.lyrics-panel header>div:first-child{display:flex;flex-direction:column;gap:2px}.lyrics-panel header strong{font-size:11px}.lyrics-panel header small{color:var(--sr-color-text-faint);font-size:11px}.lyrics-panel header>div:last-child{display:flex;gap:3px}.lyrics-panel button{padding:5px 6px;border:0;border-radius:6px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.lyrics-panel__empty{flex:1;display:grid;place-items:center;padding:20px;color:var(--sr-color-text-faint);font-size:12px;line-height:1.6;text-align:center}.lyrics-panel__lines{flex:1;margin:0;padding:45% 4px;overflow:auto;list-style:none;scrollbar-width:thin}.lyrics-panel__lines li{padding:7px 5px;color:var(--sr-color-text-faint);font-size:12px;line-height:1.45;text-align:center;transition:color 180ms,transform 180ms}.lyrics-panel__lines li.current{color:var(--sr-color-text);font-size:13px;transform:scale(1.02)}
.lyrics-panel__lines{display:flex;justify-content:center;flex-direction:column;padding:12px 4px;overflow:hidden}
.lyrics-panel header{flex-wrap:wrap;gap:12px}.lyrics-panel header strong{font-size:14px}.lyrics-panel button{min-height:44px;min-width:44px;font-size:12px;border-radius:10px}.lyrics-panel button:disabled{opacity:.45;cursor:default}.lyrics-panel__empty{font-size:13px;color:var(--sr-color-text-muted);padding:16px}.lyrics-panel__lines{gap:8px}.lyrics-panel__lines li{font-size:14px;line-height:1.6;color:var(--sr-color-text-muted);padding:4px 5px;transition:color 160ms ease}.lyrics-panel__lines li.current{font-size:17px;font-weight:600;transform:none;color:var(--sr-color-text)}.lyrics-panel--compact .lyrics-panel__lines li{font-size:12px}.lyrics-panel--compact .lyrics-panel__lines li.current{font-size:15px}
</style>
