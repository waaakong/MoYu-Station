<template>
  <span ref="root" class="sr-select" :class="attrs.class" :style="attrs.style as any">
    <button v-bind="triggerAttrs" :id="id || uid" ref="trigger" class="sr-select__trigger" type="button" role="combobox" aria-haspopup="listbox" :aria-expanded="opened" :aria-controls="`${uid}-list`" :aria-activedescendant="opened && active >= 0 ? `${uid}-option-${active}` : undefined" :aria-label="accessibleName" :aria-required="required || undefined" :disabled="disabled" @click="toggle" @keydown="keydown">
      <span class="sr-select__value">{{ selectedLabel }}</span><AppIcon name="chevronDown" class="sr-select__arrow" :class="{'is-open':opened}" />
    </button>
    <!-- Keep native option values and form/change contracts, never its OS popup. -->
    <select ref="native" class="sr-select__native" tabindex="-1" aria-hidden="true" :name="attrs.name as string" :form="attrs.form as string" :disabled="disabled" :required="required" @change="changed" @invalid.prevent="invalid"><slot /></select>
    <span ref="popup" :id="`${uid}-list`" class="sr-select__popup" :class="{'is-keyboard':keyboardMode,'opens-up':position.up}" :data-open="opened || undefined" popover="manual" role="listbox" :aria-label="accessibleName" :style="popupStyle" @pointerdown.prevent>
      <span v-for="(option,index) in options" :id="`${uid}-option-${index}`" :key="`${option.value}-${index}`" role="option" class="sr-select__option" :class="{'is-active':index===active}" :aria-selected="index===selected" :aria-disabled="option.disabled || undefined" @pointermove="!option.disabled && (active=index)" @click.stop.prevent="choose(index)">
        <span>{{ option.label }}</span><AppIcon v-if="index===selected" name="check" />
      </span>
      <span v-if="!options.length" class="sr-select__empty">暂无选项</span>
    </span>
  </span>
</template>
<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onMounted,ref,useAttrs,useId,watch } from 'vue';
import AppIcon from '../icons/AppIcon.vue';
import { placeSelect } from './selectGeometry';
import { runMotion, type MotionHandle } from '../../motion/runtime';
defineOptions({inheritAttrs:false});
const props=withDefaults(defineProps<{modelValue?:string|number;value?:string|number;modelModifiers?:{number?:boolean};disabled?:boolean;required?:boolean;id?:string}>(),{disabled:false,required:false});
const emit=defineEmits<{ 'update:modelValue':[value:string|number];change:[event:Event] }>();
const attrs=useAttrs(),uid=`select-${useId()}`;
const root=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>(),native=ref<HTMLSelectElement>(),popup=ref<HTMLElement>();
const options=ref<Array<{value:string;label:string;disabled:boolean}>>([]),selected=ref(-1),active=ref(-1),opened=ref(false),keyboardMode=ref(false),labelText=ref('');
const position=ref({left:0,top:0,width:176,maxHeight:320,up:false});
const popupStyle=computed(()=>({left:`${position.value.left}px`,top:`${position.value.top}px`,width:`${position.value.width}px`,maxHeight:`${position.value.maxHeight}px`}));
const selectedLabel=computed(()=>options.value[selected.value]?.label || '请选择');
const accessibleName=computed(()=>attrs['aria-label'] as string || labelText.value || undefined);
const triggerAttrs=computed(()=>Object.fromEntries(Object.entries(attrs).filter(([key])=>!['class','style','name','form'].includes(key))));
let observer:MutationObserver|undefined,resize:ResizeObserver|undefined,alive=true,search='',searchTime=0,resetTimer:number|undefined;
let motion:MotionHandle|undefined;
function sync(controlled=false){
  const input=native.value;if(!input)return;
  const next=Array.from(input.options).map(o=>({value:o.value,label:o.label,disabled:o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled)}));
  // Dynamic Vue option slots may reapply value attributes on render. Do not turn
  // that observation into a fresh array/render/mutation feedback loop.
  if(next.length!==options.value.length || next.some((o,i)=>o.value!==options.value[i]?.value || o.label!==options.value[i]?.label || o.disabled!==options.value[i]?.disabled)) options.value=next;
  const value=props.modelValue!==undefined?props.modelValue:props.value;
  if(controlled && value!==undefined && input.value!==String(value)) input.value=String(value);
  selected.value=input.selectedIndex;
  if(opened.value && (active.value<0 || !options.value[active.value] || options.value[active.value].disabled)) active.value=options.value.findIndex(o=>!o.disabled);
}
function measure(){
  if(!opened.value||!trigger.value)return;
  const v=window.visualViewport;
  const next=placeSelect(trigger.value.getBoundingClientRect(),{width:v?.width??innerWidth,height:v?.height??innerHeight,left:v?.offsetLeft,top:v?.offsetTop},Math.max(56,options.value.length*44+14));
  if(JSON.stringify(next)!==JSON.stringify(position.value)) position.value=next;
}
function scrollActive(){void nextTick(()=>{const item=popup.value?.querySelector<HTMLElement>(`[id="${uid}-option-${active.value}"]`);if(item&&popup.value){const top=item.offsetTop,bottom=top+item.offsetHeight;if(top<popup.value.scrollTop)popup.value.scrollTop=top;else if(bottom>popup.value.scrollTop+popup.value.clientHeight)popup.value.scrollTop=bottom-popup.value.clientHeight;}});}
async function open(keyboard=false){
  if(props.disabled||opened.value)return;
  sync(true);keyboardMode.value=keyboard;opened.value=true;active.value=selected.value>=0&&!options.value[selected.value]?.disabled?selected.value:options.value.findIndex(o=>!o.disabled);
  measure();await nextTick();if(!alive||!opened.value)return;
  motion?.revert();
  popup.value?.showPopover?.();scrollActive();
  if(popup.value&&!keyboard)motion=runMotion(popup.value,'sr-select-enter',tl=>{
    tl.fromTo(popup.value!,{y:position.value.up?4:-4,opacity:0.65},{y:0,opacity:1,duration:0.18},0);
  });
}
function close(restore=false){motion?.revert();motion=undefined;opened.value=false;search='';if(popup.value?.matches(':popover-open'))popup.value.hidePopover();if(restore&&trigger.value?.isConnected)trigger.value.focus({preventScroll:true});}
function toggle(event:MouseEvent){if(opened.value)close();else void open(event.detail===0);}
function choose(index:number){
  if(props.disabled||options.value[index]?.disabled||!native.value)return;
  const input=native.value;if(!input.options[index])return;
  const prior=input.selectedIndex;input.selectedIndex=index;close(true);
  if(prior!==index) input.dispatchEvent(new Event('change',{bubbles:true}));
}
function changed(event:Event){
  const input=event.target as HTMLSelectElement;
  const option=input.options[input.selectedIndex] as (HTMLOptionElement & {_value?:string|number})|undefined;
  const raw=option?('_value' in option?option._value:option.value):input.value;
  const numeric=props.modelModifiers?.number?Number(raw):raw;
  emit('update:modelValue',numeric??'');emit('change',event);
  // Existing handlers may roll the native value back before requesting confirmation.
  void nextTick(()=>{if(alive)sync();});
}
function invalid(){trigger.value?.focus();void open(true);}
function move(delta:number){const count=options.value.length;for(let i=1;i<=count;i++){const n=(active.value+delta*i+count*2)%count;if(!options.value[n]?.disabled){active.value=n;scrollActive();break;}}}
function keydown(event:KeyboardEvent){
  if(event.isComposing||props.disabled)return;
  const key=event.key;
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)){
    event.preventDefault();event.stopPropagation();keyboardMode.value=true;
    if(!opened.value){void open(true);return;}
    if(key==='Enter'||key===' ')choose(active.value);
    else if(key==='Home'||key==='End'){const enabled=options.value.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);active.value=(key==='Home'?enabled[0]:enabled[enabled.length-1])??-1;scrollActive();}
    else move(key==='ArrowDown'?1:-1);
  } else if(key==='Tab'){close();}
  else if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();if(!opened.value)void open(true);
    const now=Date.now();search=now-searchTime<700?search+key:key;searchTime=now;
    const index=options.value.findIndex(o=>!o.disabled&&o.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
    if(index>=0){active.value=index;scrollActive();}
  }
}
function escape(event:KeyboardEvent){if(opened.value&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}}
function outside(event:Event){if(opened.value&&!root.value?.contains(event.target as Node))close();}
function scrolled(event:Event){
  if(!opened.value||popup.value?.contains(event.target as Node))return;
  const anchor=trigger.value?.getBoundingClientRect();
  if(!anchor||anchor.bottom<0||anchor.top>innerHeight)close();else measure();
}
function blur(){close();}
function reset(){close();window.clearTimeout(resetTimer);resetTimer=window.setTimeout(()=>{if(alive)sync(true);},0);}
watch(()=>[props.modelValue,props.value],()=>nextTick(()=>sync(true)));
watch(()=>props.disabled,value=>{if(value)close();else void nextTick(()=>sync(true));});
onMounted(()=>{
  sync(true);
  const label=trigger.value?.labels?.[0];if(label){const copy=label.cloneNode(true) as HTMLElement;copy.querySelectorAll('.sr-select').forEach(n=>n.remove());labelText.value=copy.textContent?.trim()||'';}
  observer=new MutationObserver(()=>{sync(true);measure();});observer.observe(native.value!,{subtree:true,childList:true,characterData:true,attributes:true});
  resize=new ResizeObserver(measure);resize.observe(trigger.value!);
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside,true);document.addEventListener('keydown',escape,true);document.addEventListener('scroll',scrolled,true);document.addEventListener('visibilitychange',blur);document.addEventListener('close',blur,true);
  window.addEventListener('resize',blur);window.addEventListener('blur',blur);window.visualViewport?.addEventListener('resize',blur);window.visualViewport?.addEventListener('scroll',blur);native.value?.form?.addEventListener('reset',reset);
});
onBeforeUnmount(()=>{alive=false;close();window.clearTimeout(resetTimer);observer?.disconnect();resize?.disconnect();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside,true);document.removeEventListener('keydown',escape,true);document.removeEventListener('scroll',scrolled,true);document.removeEventListener('visibilitychange',blur);document.removeEventListener('close',blur,true);window.removeEventListener('resize',blur);window.removeEventListener('blur',blur);window.visualViewport?.removeEventListener('resize',blur);window.visualViewport?.removeEventListener('scroll',blur);native.value?.form?.removeEventListener('reset',reset);});
</script>
<style>
.sr-select{display:inline-flex;position:relative;min-width:0;max-width:100%;vertical-align:middle;text-align:left;color:var(--sr-color-text);border-radius:12px}
.sr-select .sr-select__native{display:none!important}
.sr-select .sr-select__trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0;min-height:44px;margin:0;padding:9px 12px;border:1px solid var(--sr-color-line-strong);border-radius:12px;background:rgba(255,255,255,.055);box-shadow:inset 0 1px #ffffff0a;color:var(--sr-color-text);font:500 13px/1.5 var(--sr-font-sans);text-align:left;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease;-webkit-app-region:no-drag}
.sr-select .sr-select__trigger:disabled{opacity:.45;cursor:default}.sr-select__value{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.sr-select .sr-select__trigger:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:3px}
.sr-select .sr-select__arrow{width:16px;height:16px;transition:transform 160ms var(--sr-ease-out);opacity:.75}.sr-select__arrow.is-open{transform:rotate(180deg)}
.sr-select__popup{display:none;box-sizing:border-box;position:fixed;inset:auto;margin:0;padding:6px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#8888 transparent;z-index:100;border:1px solid #ffffff28;border-radius:16px;background:rgba(38,39,39,.97);color:#f4f4f1;box-shadow:0 12px 36px #0005,inset 0 1px #ffffff12;backdrop-filter:blur(18px);font:500 13px/1.5 var(--sr-font-sans);text-align:left;transform-origin:top left;-webkit-app-region:no-drag}
.sr-select__popup[data-open]{display:block}.sr-select__popup.opens-up{transform-origin:bottom left}.sr-select__popup.is-keyboard{animation:none}
.sr-select__popup .sr-select__option{display:flex;align-items:center;justify-content:space-between;gap:16px;box-sizing:border-box;min-height:44px;padding:10px 12px;border-radius:10px;cursor:pointer;overflow-wrap:anywhere}
.sr-select__option>span{min-width:0}.sr-select__option .sr-icon{width:16px;height:16px}
.sr-select__popup .sr-select__option[aria-selected=true]{background:#eeefeb;color:#202222;font-weight:600}
.sr-select__popup .sr-select__option.is-active:not([aria-selected=true]){background:#ffffff15;box-shadow:inset 0 0 0 1px #ffffff35}
.sr-select__popup .sr-select__option[aria-disabled=true]{opacity:.38;cursor:not-allowed}.sr-select__empty{display:block;padding:12px;color:#c4c5c2}
@media(hover:hover) and (pointer:fine){.sr-select .sr-select__trigger:hover:not(:disabled){background:rgba(255,255,255,.10);border-color:#ffffff40}}
@keyframes select-in{from{opacity:0;transform:translateY(-3px) scale(.98)}to{opacity:1;transform:none}}
.sr-reduced-motion .sr-select__popup{animation:none}.sr-reduced-motion .sr-select__arrow{transition:none}
.sr-reduced-transparency .sr-select__popup,.sr-low-performance .sr-select__popup{background:#292b2b;backdrop-filter:none}
@media(prefers-reduced-motion:reduce){.sr-select__popup[data-open]{animation:none}.sr-select__arrow{transition:none}}
@media(prefers-contrast:more),(prefers-reduced-transparency:reduce){.sr-select__popup{background:#292b2b;backdrop-filter:none;border-color:#ccc}}
@media(forced-colors:active){.sr-select__popup{background:Canvas;color:CanvasText;backdrop-filter:none;border-color:CanvasText}.sr-select__popup .sr-select__option[aria-selected=true]{background:Highlight;color:HighlightText}}
</style>
