<template>
  <section ref="root" class="lyric-column stage-lyrics" :class="[`stage-lyrics--${lyricStyle}`,{'is-compact':compact}]" aria-label="舞台歌词" :style="colors">
    <p v-if="state.loading" class="stage-lyrics__empty" role="status">正在读取歌词…</p>
    <div v-else-if="state.error" class="stage-lyrics__empty" role="status"><p>{{state.error}}</p><button type="button" @click="retrySharedLyrics">重试读取歌词</button></div>
    <p v-else-if="!track" class="stage-lyrics__empty">选择一首音乐后显示歌词。</p>
    <p v-else-if="!state.lines.length" class="stage-lyrics__empty">{{track.source.kind==='provider'?'平台暂未提供可用的同步歌词。':'此曲目暂无同步歌词。'}}</p>
    <div v-else-if="lyricStyle==='story'" class="story-stage stage-lyrics__lines" :data-shot="storyVariant(identity,state.currentIndex)"><div class="story-caption">A MOMENT / {{String(Math.max(0,state.currentIndex)+1).padStart(2,'0')}}</div><div class="story-number" aria-hidden="true">{{String(Math.max(0,state.currentIndex)+1).padStart(2,'0')}}</div><div class="story-text is-current" :class="{'is-long':(state.lines[state.currentIndex]?.text.length||0)>80}"><span v-if="timedWords"><span v-for="(word,i) in words" :key="i" :data-word="i">{{word.text}}</span></span><span v-else>{{state.lines[Math.max(0,state.currentIndex)]?.text}}</span></div><div class="story-rule"></div></div>
    <ol v-else class="lyric-track stage-lyrics__lines" aria-live="off">
      <li v-for="entry in entries" :key="`${identity}:${entry.index}`" class="lyric-line" :data-line-index="entry.index" :class="{'active':entry.index===state.currentIndex,'is-current':entry.index===state.currentIndex,'is-long':entry.line.text.length>80}" :style="rowStyle(entry.index)"><span v-if="entry.index===state.currentIndex&&timedWords" class="stage-lyrics__text"><span v-for="(word,i) in entry.line.words" :key="i" :data-word="i">{{word.text}}</span></span><span v-else class="stage-lyrics__text">{{entry.line.text||'·'}}</span></li>
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
import {lyricWindow,lyricRowPose,storyVariant,wordProgress} from './lyricStyles';
const props=withDefaults(defineProps<{lyricStyle:StageLyricStyle;compact?:boolean}>(),{compact:false});
const player=usePlayerStore(),shell=useShellStore(),root=ref<HTMLElement>(),seekEpoch=ref(0);
const track=computed(()=>player.currentItem?.track),identity=computed(()=>JSON.stringify(state.identity));
const entries=computed(()=>lyricWindow(state.lines.length,state.currentIndex,props.lyricStyle).map(index=>({index,line:state.lines[index]!})));
const words=computed(()=>state.lines[state.currentIndex]?.words);
const timedWords=computed(()=>!!words.value?.length&&words.value.length<=500&&words.value.map(w=>w.text).join('')===state.lines[state.currentIndex]?.text);
const colors=computed(()=>({'--lyric-highlight':desktopMusicState.state?.settings.lyricsStyle?.highlight||'#d8e6ad','--lyric-base':desktopMusicState.state?.settings.lyricsStyle?.base||'#aab7a3'}));
const viewportHeight=ref(400),mobile=ref(false);let resize:ResizeObserver|undefined;
function rowStyle(index:number){const p=lyricRowPose(props.lyricStyle,index,state.currentIndex,viewportHeight.value,mobile.value);return {'--slot':index-Math.max(0,state.currentIndex),'--distance':Math.abs(index-state.currentIndex),transform:`translate(${p.x}px,${p.y}px) scale(${p.scale})`,opacity:p.opacity};}
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
    tl.fromTo(lines,{y:style==='scroll'||style==='steps'?lyricRowPose(style,0,0,viewportHeight.value,mobile.value).spacing:style==='giant'?38:14,opacity:.65},{y:0,opacity:1,duration:style==='scroll'?.48:.36,ease:'power3.out'});
    if(style==='focus')tl.fromTo(lines,{scale:.97},{scale:1,duration:.36},0);
    if(style==='chat'||style==='story')tl.fromTo(lines,{x:style==='chat'?18:(storyVariant(identity.value,state.currentIndex)-1)*24},{x:0,duration:.36},0);
  });
},{immediate:true});
function visibility(){motion?.revert();syncFrames();}
onMounted(()=>{resize=new ResizeObserver(()=>{viewportHeight.value=root.value?.clientHeight||400;mobile.value=innerWidth<=700;});if(root.value)resize.observe(root.value);document.addEventListener('visibilitychange',visibility);observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(!visible)motion?.revert();syncFrames();});if(root.value)observer.observe(root.value);});
onBeforeUnmount(()=>{alive=false;transitionTicket++;stopSeek();stopActions();stopFrames();motion?.revert();observer?.disconnect();resize?.disconnect();document.removeEventListener('visibilitychange',visibility);wordNodes=[];});
</script>
<style scoped>
.stage-lyrics{min-width:0;position:relative}.stage-lyrics__empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;color:var(--lyric-base);font-size:13px;line-height:1.8}.stage-lyrics__empty button{padding:9px 14px;border:1px solid #e7f2d933;border-radius:10px;background:#26312b;color:inherit;cursor:pointer}.stage-lyrics__lines{margin:0;padding:0;list-style:none}.lyric-line>span{white-space:pre-wrap;overflow-wrap:anywhere}.lyric-line.is-current{color:var(--lyric-highlight)!important}.lyric-line:not(.is-current){color:var(--lyric-base)}.is-long{font-size:clamp(16px,2vw,24px)!important;line-height:1.6!important;max-height:75%;overflow:auto}.stage-lyrics [data-word]{--word-fill:0%;background:linear-gradient(90deg,var(--lyric-highlight) var(--word-fill),var(--lyric-base) var(--word-fill));background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}.story-stage{height:100%}.story-text{overflow-wrap:anywhere}.story-number{user-select:none}
</style>