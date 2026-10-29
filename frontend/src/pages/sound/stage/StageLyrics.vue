<template>
  <section ref="root" class="stage-lyrics" :class="[`stage-lyrics--${lyricStyle}`,{'is-compact':compact}]" aria-label="舞台歌词" :style="colors">
    <p v-if="state.loading" class="stage-lyrics__empty" role="status">正在读取歌词…</p>
    <div v-else-if="state.error" class="stage-lyrics__empty" role="status"><p>{{ state.error }}</p><button type="button" @click="retrySharedLyrics">重试读取歌词</button></div>
    <p v-else-if="!track" class="stage-lyrics__empty">选择一首音乐后显示歌词。</p>
    <p v-else-if="!state.lines.length" class="stage-lyrics__empty">{{ track.source.kind==='provider'?'平台暂未提供可用的同步歌词。':'此曲目暂无同步歌词。' }}</p>
    <ol v-else class="stage-lyrics__lines" aria-live="off">
      <li v-for="entry in entries" :key="`${identity}:${entry.index}`" :data-line-index="entry.index" :data-story="storyVariant(identity,entry.index)" :class="{'is-current':entry.index===state.currentIndex,'is-past':entry.index<state.currentIndex,'is-long':entry.line.text.length>80}" :style="{'--distance':Math.abs(entry.index-state.currentIndex)}">
        <span v-if="entry.index===state.currentIndex && timedWords" class="stage-lyrics__text"><span v-for="(word,i) in entry.line.words" :key="i" :data-word="i">{{ word.text }}</span></span>
        <span v-else class="stage-lyrics__text">{{ entry.line.text||'·' }}</span>
      </li>
    </ol>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import type {StageLyricStyle} from '@studyroom/contracts';
import {usePlayerStore} from '../../../stores/player';
import {useShellStore} from '../../../stores/shell';
import {sharedLyricsState as state,lyricsStageClock,retrySharedLyrics} from '../../../audio/lyrics/sharedLyricsRuntime';
import {desktopMusicState} from '../../../audio/lyrics/desktopLyrics';
import {runMotion,type MotionHandle} from '../../../motion/runtime';
import {lyricWindow,storyVariant,wordProgress} from './lyricStyles';
const props=withDefaults(defineProps<{lyricStyle:StageLyricStyle;compact?:boolean}>(),{compact:false});
const player=usePlayerStore(),shell=useShellStore(),root=ref<HTMLElement>(),seekEpoch=ref(0);
const track=computed(()=>player.currentItem?.track),identity=computed(()=>JSON.stringify(state.identity));
const entries=computed(()=>lyricWindow(state.lines.length,state.currentIndex,props.lyricStyle).map(index=>({index,line:state.lines[index]!})));
const words=computed(()=>state.lines[state.currentIndex]?.words);
const timedWords=computed(()=>!!words.value?.length&&words.value.length<=500&&words.value.map(w=>w.text).join('')===state.lines[state.currentIndex]?.text);
const colors=computed(()=>({'--lyric-highlight':desktopMusicState.state?.settings.lyricsStyle?.highlight||'#d8e6ad','--lyric-base':desktopMusicState.state?.settings.lyricsStyle?.base||'#aab7a3'}));
let motion:MotionHandle|undefined,alive=true,transitionTicket=0,raf:number|undefined,wordNodes:HTMLElement[]=[],visible=true,observer:IntersectionObserver|undefined,lastWordFrame=0;
const stopSeek=watch(()=>player.playback.positionMs,(position,before)=>{if(Math.abs(position-before)>1200)seekEpoch.value++;},{flush:'sync'});
const stopActions=player.$onAction(({name})=>{if(name==='seek'){seekEpoch.value++;motion?.revert();}});
function stopFrames(){if(raf!==undefined)cancelAnimationFrame(raf);raf=undefined;}
function paintWords(position=player.playback.positionMs){
  const time=Math.max(0,position-state.offsetMs);
  words.value?.forEach((word,index)=>{const progress=wordProgress(word,time)??(time>=word.timeMs?1:0);wordNodes[index]?.style.setProperty('--word-fill',`${Math.round(progress*1000)/10}%`);});
}
function canRun(){return alive&&visible&&!document.hidden&&!shell.motionReduced&&timedWords.value&&player.playback.status==='playing'&&!player.buffering;}
function tick(now:number){raf=undefined;if(!canRun())return;if(now-lastWordFrame>=1000/30){lastWordFrame=now;paintWords(lyricsStageClock.query(now));}raf=requestAnimationFrame(tick);}
function syncFrames(){stopFrames();paintWords();if(canRun())raf=requestAnimationFrame(tick);}
watch(()=>[player.playback.positionMs,player.playback.status,player.buffering,shell.motionReduced],syncFrames);
watch(()=>[identity.value,state.currentIndex,props.lyricStyle,seekEpoch.value,shell.motionReduced] as const,async(value,before)=>{
  const ticket=++transitionTicket;motion?.revert();stopFrames();
  await nextTick();if(!alive||ticket!==transitionTicket)return;
  wordNodes=[...root.value?.querySelectorAll<HTMLElement>('[data-word]')||[]];syncFrames();
  const ordinary=before&&value[0]===before[0]&&value[1]===before[1]+1&&value[2]===before[2]&&value[3]===before[3];
  if(!ordinary||player.playback.status!=='playing'||player.buffering||shell.motionReduced||!visible||!root.value)return;
  const lines=root.value.querySelector('.stage-lyrics__lines');if(!lines)return;
  const style=props.lyricStyle;
  motion=runMotion(root.value,'stage-lyric-change',tl=>{
    tl.fromTo(lines,{y:style==='giant'?38:style==='scroll'?26:14,opacity:.65},{y:0,opacity:1,duration:style==='scroll'?.48:.36,ease:'power3.out'});
    if(style==='focus')tl.fromTo(lines,{scale:.97},{scale:1,duration:.36},0);
    if(style==='chat'||style==='story')tl.fromTo(lines,{x:style==='chat'?18:(storyVariant(identity.value,state.currentIndex)-1)*24},{x:0,duration:.36},0);
  });
},{immediate:true});
function visibility(){motion?.revert();syncFrames();}
onMounted(()=>{document.addEventListener('visibilitychange',visibility);observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(!visible)motion?.revert();syncFrames();});if(root.value)observer.observe(root.value);});
onBeforeUnmount(()=>{alive=false;transitionTicket++;stopSeek();stopActions();stopFrames();motion?.revert();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);wordNodes=[];});
</script>
<style scoped>
.stage-lyrics{position:relative;min-width:0;min-height:0;width:100%;height:100%;overflow:hidden;contain:layout style}.stage-lyrics__empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;color:var(--lyric-base);font-size:14px;line-height:1.8}.stage-lyrics__empty button{padding:10px 15px;border:1px solid #d8e6ad40;border-radius:10px;background:#d8e6ad16;color:inherit;cursor:pointer}.stage-lyrics__lines{height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:clamp(10px,2vh,22px);margin:0;padding:12px 4px;list-style:none}.stage-lyrics li{flex-shrink:0;min-width:0;line-height:1.45;color:var(--lyric-base);font-size:clamp(16px,2.1vw,25px);opacity:max(.28,calc(.72 - var(--distance)*.16));overflow-wrap:anywhere;text-wrap:pretty}.stage-lyrics li.is-current{color:var(--lyric-highlight);opacity:1;font-weight:700;font-size:clamp(22px,3.2vw,42px)}.stage-lyrics__text{white-space:pre-wrap}.stage-lyrics [data-word]{--word-fill:0%;background:linear-gradient(90deg,var(--lyric-highlight) var(--word-fill),var(--lyric-base) var(--word-fill));background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}.stage-lyrics--scroll li{text-align:left}.stage-lyrics--focus li{text-align:center}.stage-lyrics--focus li:not(.is-current){font-size:clamp(16px,2vw,23px);opacity:.38}.stage-lyrics--steps li{max-width:86%}.stage-lyrics--steps li:nth-child(3n+1){align-self:flex-start;text-align:left}.stage-lyrics--steps li:nth-child(3n+2){align-self:center;text-align:center}.stage-lyrics--steps li:nth-child(3n){align-self:flex-end;text-align:right}.stage-lyrics--giant li.is-current{font-size:clamp(32px,6vw,78px);font-weight:800;line-height:1.2;letter-spacing:-.04em}.stage-lyrics--giant li:not(.is-current){font-size:16px;opacity:.4}.stage-lyrics--chat li{width:fit-content;max-width:86%;padding:10px 18px;border-radius:18px 18px 18px 4px;background:#c9dbc50a;border:1px solid #c9dbc515;font-size:clamp(15px,1.7vw,22px)}.stage-lyrics--chat li:nth-child(even){align-self:flex-end;border-radius:18px 18px 4px 18px;text-align:right}.stage-lyrics--chat li.is-current{background:#c9dbc518;border-color:#c9dbc544;font-size:clamp(20px,2.5vw,32px)}.stage-lyrics--story li.is-current{font-size:clamp(30px,5vw,66px);line-height:1.2;font-weight:800;letter-spacing:-.04em}.stage-lyrics--story li[data-story='1']{text-align:center}.stage-lyrics--story li[data-story='2']{text-align:right}.stage-lyrics--story li:not(.is-current){font-size:16px;opacity:.35}.stage-lyrics.is-compact li{font-size:clamp(13px,1.4vw,18px)}.stage-lyrics.is-compact li.is-current{font-size:clamp(20px,2.5vw,32px)}.stage-lyrics.is-compact.stage-lyrics--giant li.is-current,.stage-lyrics.is-compact.stage-lyrics--story li.is-current{font-size:clamp(24px,3.3vw,44px)}@media(max-width:600px){.stage-lyrics__lines{gap:12px}.stage-lyrics li.is-current{font-size:25px}.stage-lyrics--chat li{padding:8px 12px}.stage-lyrics--giant li.is-current,.stage-lyrics--story li.is-current{font-size:clamp(28px,8vw,44px)}}
.stage-lyrics li:not(.is-current){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}.stage-lyrics li.is-current.is-long{font-size:clamp(16px,2vw,24px);max-height:75%;overflow:auto;scrollbar-width:thin}
</style>
