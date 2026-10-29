<template>
  <div class="lyric-colors">
    <div class="lyric-colors__title"><span>{{ label }}</span><output>{{ normalized.toUpperCase() }}</output></div>
    <div class="lyric-colors__presets">
      <button v-for="[name,color] in LYRIC_COLOR_PRESETS" :key="color" type="button" :style="{'--preset':color}" :aria-label="`${label}：${name}`" :aria-pressed="normalized===color" :disabled="disabled" @click="emit('update:modelValue',color)"></button>
      <button ref="trigger" class="lyric-colors__custom" type="button" :aria-label="`自定义${label}`" :aria-expanded="opened" :aria-controls="uid" :disabled="disabled" @click="toggle">+</button>
    </div>
    <div :id="uid" ref="popup" class="lyric-palette" popover="manual" role="dialog" :aria-label="`自定义${label}`" :style="position" @keydown="keydown">
      <header><strong>自定义{{ label }}</strong><button type="button" aria-label="关闭调色盘" @click="close(true)">×</button></header>
      <div ref="field" class="lyric-palette__field" :style="{'--hue':hsv[0]}" aria-label="饱和度与明度选色区域" @pointerdown="startPointer" @pointermove="movePointer"><span :style="{left:`${hsv[1]*100}%`,top:`${(1-hsv[2])*100}%`}"></span></div>
      <label v-for="(name,i) in ['色相','饱和度','明度']" :key="name" class="lyric-palette__slider">{{ name }}<input :ref="i===0 ? assignHue : undefined" type="range" :aria-label="`${label}${name}`" :class="{'is-hue':i===0}" min="0" :max="i===0?360:100" :value="Math.round(hsv[i]!*(i===0?1:100))" @input="changeHsv(i,$event)"><output>{{ Math.round(hsv[i]!*(i===0?1:100)) }}{{ i===0?'°':'%' }}</output></label>
      <footer><span :style="{background:normalized}"></span><input v-model="hexDraft" maxlength="7" :aria-label="`${label} HEX`" :aria-invalid="invalid||undefined" @input="changeHex"><button type="button" @click="close(true)">完成</button></footer>
      <p role="status">{{ invalid?'请输入6位十六进制颜色，例如 #D8E6AD。':'即时预览 · 保存设置后保留' }}</p>
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,ref,useId,watch} from 'vue';
import {LYRIC_COLOR_PRESETS,normalizeLyricColor,hexToHsv,hsvToHex,type Hsv} from '../../utils/lyricColor';
import {runMotion,type MotionHandle} from '../../motion/runtime';
const props=withDefaults(defineProps<{modelValue:string;label:string;disabled?:boolean}>(),{disabled:false});
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const uid='lyric-palette-'+useId(),trigger=ref<HTMLButtonElement>(),popup=ref<HTMLElement>(),field=ref<HTMLElement>(),hue=ref<HTMLInputElement>();
const normalized=computed(()=>normalizeLyricColor(props.modelValue)||'#aab7a3');
const opened=ref(false),hsv=ref<Hsv>(hexToHsv(normalized.value)),hexDraft=ref(normalized.value.toUpperCase()),invalid=ref(false),position=ref({left:'0px',top:'0px'});
let motion:MotionHandle|undefined,alive=true;
function assignHue(el:any){hue.value=el instanceof HTMLInputElement?el:undefined;}
watch(normalized,value=>{hsv.value=hexToHsv(value);if(!invalid.value)hexDraft.value=value.toUpperCase();});
function select(value:string){invalid.value=false;hexDraft.value=value.toUpperCase();emit('update:modelValue',value);}
function changeHsv(i:number,event:Event){const next=[...hsv.value] as Hsv;next[i]=+(event.target as HTMLInputElement).value/(i===0?1:100);hsv.value=next;select(hsvToHex(next));}
function changeHex(){const value=normalizeLyricColor(hexDraft.value);invalid.value=!value;if(value){hsv.value=hexToHsv(value);emit('update:modelValue',value);}}
function selectPoint(event:PointerEvent){if(!field.value)return;const r=field.value.getBoundingClientRect();hsv.value=[hsv.value[0],Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];select(hsvToHex(hsv.value));}
function startPointer(event:PointerEvent){if(event.button!==0)return;field.value?.setPointerCapture(event.pointerId);selectPoint(event);}
function movePointer(event:PointerEvent){if(field.value?.hasPointerCapture(event.pointerId))selectPoint(event);}
function measure(){if(!opened.value||!trigger.value||!popup.value)return;const r=trigger.value.getBoundingClientRect(),p=popup.value.getBoundingClientRect();position.value={left:Math.max(12,Math.min(innerWidth-p.width-12,r.right-p.width))+'px',top:Math.max(12,Math.min(innerHeight-p.height-12,r.bottom+10))+'px'};}
function outside(event:Event){if(!popup.value?.contains(event.target as Node)&&!trigger.value?.contains(event.target as Node))close();}
function stopListeners(){document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',measure);document.removeEventListener('scroll',measure,true);}
async function toggle(){if(opened.value){close(true);return;}if(props.disabled)return;document.dispatchEvent(new CustomEvent('studyroom:lyric-palette-open',{detail:uid}));opened.value=true;invalid.value=false;hexDraft.value=normalized.value.toUpperCase();hsv.value=hexToHsv(normalized.value);await nextTick();if(!alive||!opened.value)return;popup.value?.showPopover();measure();document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',measure);document.addEventListener('scroll',measure,true);if(popup.value)motion=runMotion(popup.value,'lyric-palette-enter',tl=>{tl.fromTo(popup.value!,{y:5,opacity:.2,scale:.97},{y:0,opacity:1,scale:1,duration:.2});});hue.value?.focus({preventScroll:true});}
function close(restore=false){opened.value=false;invalid.value=false;hexDraft.value=normalized.value.toUpperCase();motion?.revert();motion=undefined;if(popup.value?.matches(':popover-open'))popup.value.hidePopover();stopListeners();if(restore)trigger.value?.focus({preventScroll:true});}
function keydown(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}if(event.key==='Tab'){const nodes=[...popup.value!.querySelectorAll<HTMLElement>('button,input')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
const otherPalette=(event:Event)=>{if((event as CustomEvent).detail!==uid&&opened.value)close();};
document.addEventListener('studyroom:lyric-palette-open',otherPalette);
onBeforeUnmount(()=>{alive=false;close();document.removeEventListener('studyroom:lyric-palette-open',otherPalette);});
</script>
<style scoped>
.lyric-colors{margin:20px 0}.lyric-colors__title{display:flex;justify-content:space-between;margin-bottom:13px;font-size:12px}.lyric-colors__title output{font:10px monospace;color:var(--sr-color-text-muted)}.lyric-colors__presets{display:flex;flex-wrap:wrap;gap:11px;padding:4px}.lyric-colors__presets button{width:25px;height:25px;min-height:0;border:2px solid transparent;border-radius:50%;background:var(--preset);box-shadow:0 0 0 3px #bad0b322;cursor:pointer;color:#15261e}.lyric-colors__presets button[aria-pressed=true]{border-color:#223026;box-shadow:0 0 0 3px #d8e6ad99}.lyric-colors__presets .lyric-colors__custom{background:conic-gradient(#ed929b,#edc38e,#d5e9a3,#8cd8bf,#8abde7,#b69be3,#ed929b);font-size:19px;line-height:18px}.lyric-palette{position:fixed;margin:0;padding:20px;width:min(308px,calc(100vw - 24px));border:1px solid #c7d9b63b;border-radius:20px;background:linear-gradient(135deg,#304039,#1b2925);color:#edf2e7;box-shadow:0 20px 70px #0008;z-index:500}.lyric-palette header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.lyric-palette header strong{font-size:14px}.lyric-palette button{border:0;background:none;color:inherit;cursor:pointer;min-height:30px}.lyric-palette header button{font-size:22px}.lyric-palette__field{height:142px;position:relative;touch-action:none;border-radius:11px;background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent),hsl(var(--hue) 100% 50%);cursor:crosshair;overflow:hidden}.lyric-palette__field span{width:12px;height:12px;border:2px solid white;box-shadow:0 0 0 1px #0008;border-radius:50%;position:absolute;transform:translate(-50%,-50%);pointer-events:none}.lyric-palette__slider{display:grid;grid-template-columns:44px 1fr 34px;gap:8px;align-items:center;font-size:10px;color:#a5b5a7;min-height:32px}.lyric-palette__slider input{width:100%;accent-color:#d8e6ad}.lyric-palette__slider output{text-align:right;font:10px monospace}.lyric-palette .is-hue{appearance:none;height:7px;border-radius:8px;background:linear-gradient(90deg,#f55,#ff5,#5f5,#5ff,#55f,#f5f,#f55)}.lyric-palette footer{display:flex;align-items:center;gap:10px;border-top:1px solid #dbe8c622;padding-top:14px;margin-top:8px}.lyric-palette footer span{width:34px;height:34px;border:1px solid #d8e8be30;border-radius:9px}.lyric-palette footer input{width:100px;min-width:0;padding:9px;background:#10221e70;border:1px solid #dbe8c622;border-radius:9px;color:inherit;font:12px monospace}.lyric-palette footer input[aria-invalid=true]{border-color:#edaf98}.lyric-palette footer button{margin-left:auto;color:#d8e6ad;font-size:11px}.lyric-palette p{font-size:10px;color:#a5b5a7;margin:12px 0 0;min-height:15px}button:focus-visible,input:focus-visible{outline:2px solid #d8e6ad;outline-offset:3px}
</style>
