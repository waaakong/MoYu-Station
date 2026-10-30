<template><div ref="host" class="parity-backgrounds" aria-hidden="true"><canvas ref="flow" class="flow-background"></canvas><canvas ref="canvas" class="visual-canvas listening-stage__visual" :style="{opacity:pure?1:preferences.background==='wave'?.68:preferences.background==='particles'?.7:preferences.background==='cover'?.52:.82}"></canvas></div></template>
<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import type {StagePreferences} from '@studyroom/contracts';
import {sharedAudioGraph} from '../../../audio/runtime/audioRuntime';
import {PreviewBackgroundRenderer} from './previewBackgroundRenderer';
import {BackgroundLoop} from './backgroundLoop';
const props=defineProps<{preferences:StagePreferences;playing:boolean;positionMs:number;ambientPlaying:boolean;reduced:boolean;pure:boolean;coverKey:string;tone?:string}>();
const emit=defineEmits<{signal:[state:'unavailable'|'silent'|'active']}>();
const host=ref<HTMLElement>(),flow=ref<HTMLCanvasElement>(),canvas=ref<HTMLCanvasElement>();
let renderer:PreviewBackgroundRenderer|undefined,loop:BackgroundLoop|undefined,resizeObserver:ResizeObserver|undefined,intersection:IntersectionObserver|undefined,visible=true,disposed=false;
let frequency=new Uint8Array(0),waveform=new Uint8Array(0),time=0,previous=0,lastSignal='';
function signal(state:'unavailable'|'silent'|'active'){if(lastSignal!==state){lastSignal=state;emit('signal',state);}}
function draw(now=performance.now(),fps=40){
  const analyser=sharedAudioGraph.analyserNode();let energy=0,bass=0;
  if(analyser){if(frequency.length!==analyser.frequencyBinCount)frequency=new Uint8Array(analyser.frequencyBinCount);if(waveform.length!==analyser.fftSize)waveform=new Uint8Array(analyser.fftSize);analyser.getByteFrequencyData(frequency);analyser.getByteTimeDomainData(waveform);for(let i=0;i<frequency.length;i++){energy+=frequency[i];if(i<16)bass+=frequency[i];}energy/=Math.max(1,frequency.length)*255;bass/=Math.min(16,frequency.length)*255;signal(energy>.001?'active':'silent');}else signal('unavailable');
  const moving=!props.reduced&&!document.hidden&&visible&&props.preferences.background!=='off';
  if(moving)time+=Math.min(.1,Math.max(0,(now-previous)/1000));
  previous=now;
  renderer?.draw({tone:props.tone,time,energy,bass,frequency:analyser&&!props.reduced?frequency:null,waveform:analyser&&!props.reduced?waveform:null,preferences:props.reduced?{...props.preferences,background:'off'}:props.preferences,moving,pure:props.pure,quality:fps});
}
function resize(){if(!host.value)return;const r=host.value.getBoundingClientRect();renderer?.resize(r.width,r.height,devicePixelRatio);draw();}
function sync(){loop?.stop();previous=performance.now();draw();if(!disposed&&visible&&!document.hidden&&!props.reduced&&props.preferences.background!=='off')loop?.start();}
function setCoverImage(image:HTMLImageElement|null){renderer?.setCover(image);draw();}
defineExpose({setCoverImage});
watch(()=>props.playing,sync);
watch(()=>[props.ambientPlaying,props.reduced],sync);
watch(()=>props.preferences,()=>{loop?.configure(props.preferences.quality);sync();},{deep:true});
watch(()=>props.coverKey,()=>{renderer?.setCover(null);void nextTick(()=>{if(!disposed)draw();});});
watch(()=>[props.pure,props.tone],()=>draw());
onMounted(()=>{renderer=new PreviewBackgroundRenderer(flow.value!,canvas.value!);loop=new BackgroundLoop(draw);loop.configure(props.preferences.quality);sharedAudioGraph.initialize();previous=performance.now();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host.value!);intersection=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);sync();});intersection.observe(host.value!);document.addEventListener('visibilitychange',sync);resize();sync();});
onBeforeUnmount(()=>{disposed=true;loop?.dispose();renderer?.dispose();intersection?.disconnect();resizeObserver?.disconnect();document.removeEventListener('visibilitychange',sync);frequency=new Uint8Array(0);waveform=new Uint8Array(0);});
</script>
<style scoped>.parity-backgrounds{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}.flow-background,.visual-canvas{position:absolute;inset:0;display:block;width:100%;height:100%}.flow-background{opacity:.88;background:radial-gradient(ellipse at 25% 40%,#194755,transparent 65%),radial-gradient(ellipse at 80% 65%,#6a493a88,transparent 60%),#0b1826}.visual-canvas{mix-blend-mode:screen;opacity:.82}</style>
