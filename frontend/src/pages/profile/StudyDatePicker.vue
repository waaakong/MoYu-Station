<template>
  <div ref="root" class="study-date-picker" @keydown.esc.stop.prevent="dismiss" @focusout="leave">
    <button ref="trigger" class="date-trigger" type="button" aria-label="选择报告日期" :aria-expanded="open" aria-controls="study-date-calendar" @click="toggle">
      <span>{{ modelValue.replaceAll('-', ' / ') }}</span><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>
    </button>
    <section v-if="open" id="study-date-calendar" class="date-calendar" aria-label="报告日期日历">
      <header>
        <button type="button" aria-label="上个月" :disabled="month<=min.slice(0,7)" @click="moveMonth(-1)">‹</button>
        <div class="month-select"><select aria-label="年份" :value="Number(month.slice(0,4))" @change="setPart('year',$event)"><option v-for="year in years" :key="year" :value="year">{{ year }}年</option></select><select aria-label="月份" :value="Number(month.slice(5,7))" @change="setPart('month',$event)"><option v-for="m in 12" :key="m" :value="m" :disabled="`${month.slice(0,4)}-${String(m).padStart(2,'0')}`<min.slice(0,7)||`${month.slice(0,4)}-${String(m).padStart(2,'0')}`>max.slice(0,7)">{{ m }}月</option></select></div>
        <button type="button" aria-label="下个月" :disabled="month>=max.slice(0,7)" @click="moveMonth(1)">›</button>
      </header>
      <div class="weekdays" aria-hidden="true"><span v-for="name in weekdays" :key="name">{{ name }}</span></div>
      <div class="date-grid" role="grid" :aria-label="`${month} 日期`" @keydown="key">
        <div v-for="row in 6" :key="row" role="row">
          <span v-for="cell in cells.slice((row-1)*7,row*7)" :key="cell" role="gridcell" :aria-selected="cell===modelValue">
            <button :data-date="cell" type="button" :disabled="cell<min||cell>max" :tabindex="cell===focused?0:-1" :aria-label="cell" :aria-current="cell===max?'date':undefined" :class="{selected:cell===modelValue,outside:cell.slice(0,7)!==month,today:cell===max}" @click="select(cell)">{{ Number(cell.slice(-2)) }}</button>
          </span>
        </div>
      </div>
      <footer><span>北京时间</span><button type="button" @click="select(max)">今天</button></footer>
    </section>
  </div>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref} from 'vue';
const props=defineProps<{modelValue:string;min:string;max:string}>();
const emit=defineEmits<{'update:modelValue':[date:string];change:[]}>();
const open=ref(false),month=ref(''),focused=ref(''),root=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>();
const weekdays=['一','二','三','四','五','六','日'];
const years=computed(()=>Array.from({length:Number(props.max.slice(0,4))-Number(props.min.slice(0,4))+1},(_,i)=>Number(props.min.slice(0,4))+i));
function iso(d:Date){return d.toISOString().slice(0,10);}
const clamp=(date:string)=>date<props.min?props.min:date>props.max?props.max:date;
const cells=computed(()=>{
  const first=new Date(`${month.value}-01T00:00:00Z`),offset=(first.getUTCDay()+6)%7;
  return Array.from({length:42},(_,i)=>iso(new Date(first.getTime()+(i-offset)*86400000)));
});
async function focusDay(){await nextTick();root.value?.querySelector<HTMLButtonElement>(`[data-date="${focused.value}"]`)?.focus();}
function toggle(){if(open.value){dismiss();return;}focused.value=clamp(props.modelValue||props.max);month.value=focused.value.slice(0,7);open.value=true;void focusDay();}
function dismiss(){if(!open.value)return;open.value=false;trigger.value?.focus();}
function select(date:string){if(date<props.min||date>props.max)return;emit('update:modelValue',date);if(date!==props.modelValue)emit('change');dismiss();}
function moveMonth(delta:number){
  const d=new Date(`${month.value}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);
  month.value=clamp(iso(d)).slice(0,7);focused.value=clamp(`${month.value}-01`);
}
function setPart(part:'year'|'month',event:Event){
  const value=(event.target as HTMLSelectElement).value;
  month.value=clamp(`${part==='year'?value:month.value.slice(0,4)}-${part==='month'?value.padStart(2,'0'):month.value.slice(5,7)}-01`).slice(0,7);
  focused.value=clamp(`${month.value}-01`);
}
function key(e:KeyboardEvent){
  const current=(e.target as HTMLElement).dataset.date;if(!current)return;
  const date=new Date(`${current}T00:00:00Z`),offset=(date.getUTCDay()+6)%7;
  const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-offset,End:6-offset};
  if(e.key in delta)date.setUTCDate(date.getUTCDate()+delta[e.key]!);
  else if(e.key==='PageUp'||e.key==='PageDown'){
    const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+(e.key==='PageUp'?-1:1));
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));
  }else return;
  e.preventDefault();focused.value=clamp(iso(date));month.value=focused.value.slice(0,7);void focusDay();
}
function outside(e:PointerEvent){if(e.target instanceof Node&&!root.value?.contains(e.target))open.value=false;}
function leave(e:FocusEvent){if(e.relatedTarget instanceof Node&&!root.value?.contains(e.relatedTarget))open.value=false;}
onMounted(()=>document.addEventListener('pointerdown',outside));
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<style scoped>
.study-date-picker{position:relative;display:inline-block;color:var(--sr-color-text);font-size:14px}
button,select{font:inherit;color:inherit;border:1px solid var(--sr-color-line-strong);border-radius:12px;background:var(--sr-color-surface-raised);min-height:40px;cursor:pointer}
button:focus-visible,select:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}button:disabled{opacity:.3;cursor:default}
.date-trigger{display:flex;align-items:center;gap:16px;padding:8px 14px;font-variant-numeric:tabular-nums}.date-trigger svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6}
.date-calendar{position:absolute;z-index:30;top:calc(100% + 8px);left:0;width:min(308px,calc(100vw - 80px));padding:14px;border:1px solid var(--sr-color-line-strong);border-radius:20px;background:#252d2a;box-shadow:0 16px 44px #0005}
header{display:flex;align-items:center;gap:6px;margin-bottom:12px}header>button{width:34px;flex:none;font-size:24px;background:transparent;border-color:transparent}.month-select{display:flex;justify-content:center;gap:2px;flex:1;min-width:0}select{min-width:0;max-width:100%;padding:4px 0;background:#303a35;border-color:transparent;font-size:13px}
.weekdays,.date-grid [role=row]{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));text-align:center;gap:2px}.weekdays{font-size:12px;opacity:.6;margin-bottom:6px}.date-grid [role=gridcell]{min-width:0}.date-grid button{width:100%;padding:0;min-height:36px;border-color:transparent;background:transparent;font-size:13px;border-radius:10px;font-variant-numeric:tabular-nums}.date-grid button:hover:not(:disabled){background:#ffffff12}.date-grid .outside{opacity:.4}.date-grid .today{border-color:#ffffff50}.date-grid .selected{background:#edf1e9!important;color:#24302a;font-weight:700;opacity:1}
footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--sr-color-line-strong);margin-top:10px;padding-top:8px;font-size:12px}footer>span{opacity:.6}footer button{border:0;background:transparent;padding:4px 12px;min-height:36px}
@media(max-width:480px){.date-calendar{width:min(288px,calc(100vw - 80px));padding:10px}.date-grid button{min-height:32px}}
</style>
