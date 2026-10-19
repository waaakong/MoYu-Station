<template>
  <button class="date-trigger" type="button" aria-haspopup="dialog" :aria-expanded="opened" aria-label="选择到期时间" @click="open">{{ displayValue }}</button>
  <Teleport to="body">
    <dialog ref="dialog" class="date-picker sr-glass sr-glass--floating" aria-labelledby="date-picker-title" @keydown="containDialogFocus" @cancel.prevent="cancel" @close="opened=false">
      <header><div><h2 id="date-picker-title">到期时间</h2><p>使用本机时区，确认后应用</p></div><button type="button" @click="cancel">取消</button></header>
      <div class="calendar-head">
        <button type="button" aria-label="上个月" @click="changeMonth(-1)">‹</button><strong>{{ year }} 年 {{ month+1 }} 月</strong><button type="button" aria-label="下个月" @click="changeMonth(1)">›</button>
      </div>
      <div class="weekdays" aria-hidden="true"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</span></div>
      <div class="calendar-days" aria-label="选择日期">
        <span v-for="blank in offset" :key="'blank'+blank"></span>
        <button v-for="day in days" :key="day" type="button" :aria-pressed="isSelected(day)" :aria-label="`${year}年${month+1}月${day}日`" :class="{ selected:isSelected(day), today:isToday(day) }" @click="selectDay(day)">{{ day }}</button>
      </div>
      <div class="time-label"><span>时间</span><strong>{{ padded(hour) }} : {{ padded(minute) }}</strong></div>
      <div class="time-wheels">
        <div ref="hours" class="time-wheel" role="listbox" tabindex="0" aria-label="小时" :aria-activedescendant="'expiry-hour-'+hour" @scroll.passive="scrollWheel('hour',$event)" @keydown="keyWheel('hour',$event)">
          <div v-for="value in 24" :id="'expiry-hour-'+(value-1)" :key="value" role="option" :aria-selected="hour===value-1" @click="chooseTime('hour',value-1)">{{ padded(value-1) }}</div>
        </div>
        <span class="time-colon" aria-hidden="true">:</span>
        <div ref="minutes" class="time-wheel" role="listbox" tabindex="0" aria-label="分钟" :aria-activedescendant="'expiry-minute-'+minute" @scroll.passive="scrollWheel('minute',$event)" @keydown="keyWheel('minute',$event)">
          <div v-for="value in 60" :id="'expiry-minute-'+(value-1)" :key="value" role="option" :aria-selected="minute===value-1" @click="chooseTime('minute',value-1)">{{ padded(value-1) }}</div>
        </div>
        <div class="wheel-selection" aria-hidden="true"></div>
      </div>
      <footer><button type="button" @click="clear">不限时间</button><button type="button" @click="today">今天</button><button class="primary" type="button" @click="confirm">确定</button></footer>
    </dialog>
  </Teleport>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import { computed,nextTick,onBeforeUnmount,ref } from 'vue';
import { containDialogFocus } from './dialogFocus';
const props=defineProps<{modelValue:string}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const dialog=ref<HTMLDialogElement>(),hours=ref<HTMLElement>(),minutes=ref<HTMLElement>(),opened=ref(false);
const year=ref(2026),month=ref(0),selected=ref(''),hour=ref(0),minute=ref(0);
const padded=(value:number)=>String(value).padStart(2,'0');
const dateValue=(day:number)=>`${year.value}-${padded(month.value+1)}-${padded(day)}`;
const days=computed(()=>new Date(year.value,month.value+1,0).getDate());
const offset=computed(()=>(new Date(year.value,month.value,1).getDay()+6)%7);
const displayValue=computed(()=>props.modelValue?props.modelValue.replace('T',' '):'不限时间');
let trigger:HTMLElement|null=null;
function setDate(date:Date){year.value=date.getFullYear();month.value=date.getMonth();selected.value=dateValue(date.getDate());hour.value=date.getHours();minute.value=date.getMinutes();}
async function positionWheels(){await nextTick();if(hours.value)hours.value.scrollTop=hour.value*44;if(minutes.value)minutes.value.scrollTop=minute.value*44;}
async function open(){
  trigger=document.activeElement as HTMLElement;
  const parsed=props.modelValue?new Date(props.modelValue):new Date();
  setDate(Number.isNaN(parsed.getTime())?new Date():parsed);
  opened.value=true;openMotionDialog(dialog.value);await positionWheels();
}
function cancel(){closeMotionDialog(dialog.value, false, () => {opened.value=false;trigger?.focus();});}
function clear(){emit('update:modelValue','');cancel();}
function confirm(){emit('update:modelValue',`${selected.value}T${padded(hour.value)}:${padded(minute.value)}`);cancel();}
function changeMonth(amount:number){const date=new Date(year.value,month.value+amount,1);year.value=date.getFullYear();month.value=date.getMonth();}
function selectDay(day:number){selected.value=dateValue(day);}
function isSelected(day:number){return selected.value===dateValue(day);}
function isToday(day:number){const now=new Date();return now.getFullYear()===year.value&&now.getMonth()===month.value&&now.getDate()===day;}
async function today(){setDate(new Date());await positionWheels();}
function scrollWheel(kind:'hour'|'minute',event:Event){const value=Math.min(kind==='hour'?23:59,Math.max(0,Math.round((event.target as HTMLElement).scrollTop/44)));if(kind==='hour')hour.value=value;else minute.value=value;}
function chooseTime(kind:'hour'|'minute',value:number){if(kind==='hour'){hour.value=value;if(hours.value)hours.value.scrollTop=value*44;}else{minute.value=value;if(minutes.value)minutes.value.scrollTop=value*44;}}
function keyWheel(kind:'hour'|'minute',event:KeyboardEvent){
  const current=kind==='hour'?hour.value:minute.value,max=kind==='hour'?23:59;
  let next=current;if(event.key==='ArrowUp')next=Math.max(0,current-1);else if(event.key==='ArrowDown')next=Math.min(max,current+1);else if(event.key==='Home')next=0;else if(event.key==='End')next=max;else return;
  event.preventDefault();chooseTime(kind,next);
}
onBeforeUnmount(()=>closeMotionDialog(dialog.value, true));
</script>
<style scoped>
.date-trigger{width:100%;text-align:left;min-height:44px;padding:0 12px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-control);background:var(--sr-color-surface-solid);color:var(--sr-color-text);font:inherit;cursor:pointer;white-space:nowrap}
.date-picker{width:min(388px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-panel);background:var(--sr-color-surface-solid);color:var(--sr-color-text);box-shadow:0 24px 80px #0006;scrollbar-width:thin}
.date-picker::backdrop{background:rgba(5,8,14,.5)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}h2{font-size:21px;font-weight:650;margin:0}header p{font-size:12px;color:var(--sr-color-text-muted);margin:6px 0 0}
button{min-height:44px;min-width:44px;padding:0 12px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:rgba(255,255,255,.035);color:inherit;font:500 13px var(--sr-font-sans);cursor:pointer}
button:focus-visible,.time-wheel:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}
.calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.calendar-head strong{font-size:15px;font-weight:600}.calendar-head button{font-size:24px;border-color:transparent;background:transparent}
.weekdays,.calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}.weekdays span{font-size:12px;color:var(--sr-color-text-muted);text-align:center;padding:8px 0}
.calendar-days button{padding:0;min-width:0;width:44px;max-width:100%;height:44px;justify-self:center;border:1px solid transparent;background:transparent;border-radius:50%;font-size:14px;font-variant-numeric:tabular-nums}
.calendar-days .today{border-color:var(--sr-color-line-strong)}.calendar-days .selected{color:var(--sr-color-accent-ink);background:var(--sr-color-accent)}
.time-label{display:flex;justify-content:space-between;padding:20px 0 0;margin-top:12px;border-top:1px solid var(--sr-color-line);font-size:13px;color:var(--sr-color-text-muted)}.time-label strong{font-weight:500;color:var(--sr-color-text);font-variant-numeric:tabular-nums}
.time-wheels{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);position:relative;isolation:isolate;margin-top:8px}
.time-wheel{height:132px;overflow-y:auto;overscroll-behavior:contain;scroll-snap-type:y mandatory;padding-block:44px;scrollbar-width:none;mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);touch-action:pan-y;font-variant-numeric:tabular-nums}
.time-wheel::-webkit-scrollbar{display:none}.time-wheel>div{height:44px;display:grid;place-items:center;scroll-snap-align:center;font-size:20px;color:var(--sr-color-text-muted);cursor:pointer}.time-wheel>div[aria-selected="true"]{color:var(--sr-color-text);font-weight:600}
.time-colon{display:grid;place-items:center;font-size:20px}.wheel-selection{position:absolute;z-index:-1;inset:44px 0;border-radius:10px;background:var(--sr-color-selected);pointer-events:none}
footer{display:flex;gap:8px;margin-top:20px;padding-block:8px;background:transparent}footer button{flex:1;white-space:nowrap}.primary{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent}
@media(hover:hover) and (pointer:fine){button:not(.selected):not(.primary):hover{background:rgba(255,255,255,.08)}}
@media(max-width:400px){.date-picker{padding:18px}.calendar-days button{min-height:40px;height:40px;width:40px}}
@media(max-height:720px){
 .date-picker{padding:16px}
 header{margin-bottom:8px}.calendar-head{margin-bottom:4px}.weekdays span{padding:4px 0}
 .calendar-days button{height:36px;min-height:36px;width:36px}
 .time-label{padding-top:12px;margin-top:8px}
 footer{margin-top:12px}
}
</style>
