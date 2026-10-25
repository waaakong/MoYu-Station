<template>
  <dialog ref="dialog" class="study-card-editor sr-glass sr-glass--floating" aria-labelledby="study-card-title" @close="!dialog?.open && release()" @cancel.prevent="close">
    <header><h2 id="study-card-title">学习卡片</h2><button autofocus type="button" @click="close">关闭</button></header>
    <div class="card-date"><span>报告日期（北京时间）</span><StudyDatePicker v-model="selectedDate" min="2000-01-01" :max="today" @change="loadDate" /></div>
    <div class="study-card-body" :aria-busy="busy">
      <section aria-label="学习卡片预览"><canvas ref="canvas" role="img" aria-label="学习卡片图片预览" aria-describedby="study-card-transcript" width="1200" height="675" /><p>1200 × 675 · PNG · Asia/Shanghai · 背景：{{ backgroundName }}</p><p id="study-card-transcript">{{ transcript }}</p></section>
      <section aria-label="导出内容设置"><fieldset :disabled="busy || !ready"><legend>卡片展示内容</legend><label><input v-model="options.focus" type="checkbox" />专注分钟</label><label><input v-model="options.fish" type="checkbox" />摸鱼分钟</label><label><input v-model="options.effort" type="checkbox" />假努力指数</label><small>可全部取消，仅影响本张卡片。</small></fieldset><p class="study-card-quote">{{ studyQuotes[quote] }}</p><button type="button" :disabled="busy || !ready" @click="quote=nextQuote(quote)">随机一句</button><p>未采集的指标显示“暂无”，不作为能力评价。</p></section>
    </div>
    <footer><p :role="failed?'alert':'status'">{{ status }}</p><div><button type="button" @click="busy?cancel():close()">{{ busy?'取消生成':'返回统计' }}</button><button type="button" :disabled="busy" @click="ready?save():prepare()">{{ busy?'生成中…':failed?'重试生成 PNG':'保存 PNG' }}</button></div></footer>
  </dialog>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import {computed,nextTick,onBeforeUnmount,reactive,ref,watch} from 'vue';
import {useAuthStore} from '../../stores/auth';
import StudyDatePicker from './StudyDatePicker.vue';
import {scenes} from '../../data/scenes';
import {fetchShareCard,type ShareCard} from '../../services/profile';
import {studyQuotes,nextQuote,studyCardSnapshot,cardTranscript,paintStudyCard,type StudyCard} from '../../profile/studyCard';
const props=defineProps<{report:ShareCard}>(),auth=useAuthStore();
const selectedDate=ref(''),today=ref('');
const dialog=ref<HTMLDialogElement>(),canvas=ref<HTMLCanvasElement>(),ready=ref(false),busy=ref(false),failed=ref(false),status=ref(''),backgroundName=ref('');
const options=reactive({focus:true,fish:true,effort:true}),quote=ref(Math.floor(Math.random()*studyQuotes.length));
const snapshot=ref<StudyCard|null>(null),transcript=computed(()=>snapshot.value?cardTranscript(snapshot.value):'正在准备预览');
let generation=0,image:HTMLImageElement|null=null,loadAbort:AbortController|null=null;
let openedReport:ShareCard|null=null,openedNickname='',openedOwner:unknown=null,openedSession=-1,background='';
const urls=new Map<string,ReturnType<typeof setTimeout>>();
const current=(ticket:number)=>ticket===generation && dialog.value?.open && auth.user?.id===openedOwner && auth.sessionGeneration===openedSession && !auth.authTransition && !auth.isBanned;
function release(){generation++;loadAbort?.abort();loadAbort=null;image=null;ready.value=false;busy.value=false;snapshot.value=null;openedReport=null;openedNickname='';for(const [url,timer]of urls){clearTimeout(timer);URL.revokeObjectURL(url);}urls.clear();if(canvas.value){canvas.value.width=0;canvas.value.height=0;}}
function close(){cancel();closeMotionDialog(dialog.value, false, release);}
function cancel(){generation++;loadAbort?.abort();busy.value=false;status.value='已取消本次生成，没有发起下载。';}
function draw(){if(!ready.value || !image || !canvas.value || !openedReport)return;snapshot.value=studyCardSnapshot(openedReport,openedNickname,options,quote.value);paintStudyCard(canvas.value,snapshot.value,image);failed.value=false;status.value='预览与 PNG 内容一致；未勾选指标不会导出。';}
async function prepare(){
  if(!openedReport){await loadDate();return;}
  if(busy.value)return;const ticket=++generation;busy.value=true;ready.value=false;failed.value=false;status.value='正在准备卡片背景…';
  const controller=new AbortController();loadAbort=controller;const timer=setTimeout(()=>controller.abort(),15000);
  try{const loaded=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();const abort=()=>{img.onload=null;img.onerror=null;img.src='';reject(new Error('背景读取取消或超时'));};controller.signal.addEventListener('abort',abort,{once:true});img.onload=()=>{controller.signal.removeEventListener('abort',abort);resolve(img);};img.onerror=()=>{controller.signal.removeEventListener('abort',abort);reject(new Error('背景读取失败'));};img.src=background;});
    if(!current(ticket))return;image=loaded;ready.value=true;draw();
  }catch(error){if(current(ticket)){failed.value=true;status.value='背景无法读取，未生成 PNG。请重试。';}}
  finally{clearTimeout(timer);if(current(ticket))busy.value=false;}
}
async function open(){
  if(!auth.user || auth.authTransition || auth.isBanned)return;
  openedNickname=auth.user.nickname||auth.user.username;openedOwner=auth.user.id;openedSession=auth.sessionGeneration;
  today.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  selectedDate.value=props.report.statDate||today.value;
  await nextTick();openMotionDialog(dialog.value);await loadDate();
}
async function loadDate(){
  loadAbort?.abort();const ticket=++generation;openedReport=null;ready.value=false;snapshot.value=null;image=null;busy.value=true;failed.value=false;
  if(canvas.value){canvas.value.width=1200;canvas.value.height=675;}
  status.value='正在读取所选日期的记录…';
  try{
    const date=selectedDate.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today.value||date<'2000-01-01')throw new Error('date');
    const report=await fetchShareCard(date);if(!current(ticket))return;
    if(report.statDate!==date||report.timeZone!=='Asia/Shanghai')throw new Error('date');
    openedReport={...report};
    const historical=scenes.find(item=>item.name===report.favoriteScene),selected=historical||scenes[0]!;
    background=selected.images.morning;backgroundName.value=historical?`${selected.name}（装饰背景）`:'默认装饰背景，非历史场景记录';
    busy.value=false;await prepare();
  }catch{if(current(ticket)){busy.value=false;failed.value=true;status.value='该日期读取失败，未使用其他日期的数据。请重试。';}}
}
async function save(){
  if(busy.value || !ready.value || !canvas.value || !snapshot.value)return;
  const ticket=++generation;busy.value=true;failed.value=false;status.value='正在生成 PNG，可取消本次任务…';
  const date=snapshot.value.date;let timer:ReturnType<typeof setTimeout>|undefined;
  try{const blob=await Promise.race([new Promise<Blob>((resolve,reject)=>canvas.value!.toBlob(value=>value?resolve(value):reject(new Error('图片编码失败')),'image/png')),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('编码超时')),15000);})]);
    if(!current(ticket))return;
    const url=URL.createObjectURL(blob);urls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000));
    const link=document.createElement('a');link.href=url;link.download=`Moyu-${date==='日期不可用'?'study':date}-card.png`;document.body.append(link);link.click();link.remove();
    status.value='已发起 PNG 下载，请在下载列表确认保存结果。';
  }catch(error){if(current(ticket)){failed.value=true;status.value='生成失败，选项与文案已保留。可重试或取消。';}}
  finally{clearTimeout(timer);if(current(ticket))busy.value=false;}
}
watch([options,quote],()=>{if(!busy.value&&dialog.value?.open)try{draw();}catch{ready.value=false;failed.value=true;status.value='预览失败，请重试。';}});
watch(()=>auth.sessionGeneration,()=>{closeMotionDialog(dialog.value,true);release();options.focus=options.fish=options.effort=true;quote.value=Math.floor(Math.random()*studyQuotes.length);});
onBeforeUnmount(()=>{closeMotionDialog(dialog.value,true);release();});defineExpose({open});
</script>
<style scoped>
.study-card-editor{margin:auto;width:min(1080px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:0;color:var(--sr-color-text);border:1px solid var(--sr-color-line-strong);border-radius:24px;overflow:hidden}
.study-card-editor[open]{display:flex;flex-direction:column}.study-card-editor::backdrop{background:#0007}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;flex:none}h2{margin:0;font-size:22px}footer{border-top:1px solid var(--sr-color-line)}footer>div{display:flex;gap:8px;flex-shrink:0}
.study-card-body{display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:24px;padding:0 24px 20px;overflow:auto;min-height:0}.study-card-body section{min-width:0}
canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;border-radius:12px;background:#192321}p,small{font-size:12px;line-height:1.7;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0}label{display:flex;align-items:center;gap:10px;min-height:44px}input{width:18px;height:18px}.study-card-quote{font-size:17px}
button{min-height:44px;padding:8px 16px;border-radius:14px;border:1px solid var(--sr-color-line-strong);background:var(--sr-color-surface-raised);color:inherit}button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}button:disabled{opacity:.5}
.card-date{display:flex;align-items:center;gap:12px;padding:0 24px 16px;flex-wrap:wrap}
@media(max-width:800px){.study-card-body{grid-template-columns:1fr}header,footer{padding:16px}footer{flex-direction:column;align-items:stretch;gap:8px}footer p{margin:0}.study-card-body{padding:0 16px 16px}footer>div{justify-content:flex-end}}
@media(prefers-reduced-motion:no-preference){.study-card-editor[open]{animation:study-card-in 160ms ease-out}.sr-reduced-motion .study-card-editor[open]{animation:none}}
@keyframes study-card-in{from{transform:translateY(6px)}to{transform:translateY(0)}}
</style>
