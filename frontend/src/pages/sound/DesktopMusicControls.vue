<template>
  <details v-if="desktop" class="desktop-music"><summary>桌面歌词与快捷键</summary>
    <p v-if="model.error||model.state?.error" role="alert">{{ model.error||model.state?.error }}</p>
    <template v-if="draft"><label><input v-model="draft.lyricsVisible" type="checkbox" />显示桌面歌词</label><label><input v-model="draft.lyricsLocked" type="checkbox" />锁定浮窗（在此取消即可解锁）</label><label><input v-model="draft.shortcutsEnabled" type="checkbox" />启用全局媒体快捷键</label>
      <label v-for="entry in commands" :key="entry.key">{{ entry.name }}<input v-model="draft.shortcuts[entry.key]" spellcheck="false" :aria-label="entry.name+'快捷键'" maxlength="60" /></label>
      <p>支持媒体键，或 Control+Alt+字母／数字／F1–F12，可加 Shift。冲突时保留原设置。</p>
      <template v-if="draft.lyricsStyle"><label>歌词字号 <input v-model.number="draft.lyricsStyle.fontSize" type="range" min="22" max="48" step="1" /><output>{{ draft.lyricsStyle.fontSize }}</output></label><label>歌词高亮色 <input v-model="draft.lyricsStyle.highlight" type="color" /></label><label>歌词行数 <select v-model.number="draft.lyricsStyle.rows"><option :value="1">单行</option><option :value="2">双行</option></select></label></template>
      <template v-if="draft.wheel"><label><input v-model="draft.wheel.enabled" type="checkbox" />启用全局快捷轮盘</label><label>轮盘快捷键<input v-model="draft.wheel.accelerator" maxlength="60" spellcheck="false" /></label><label><input v-model="draft.wheel.allowFullscreen" type="checkbox" />全屏应用中也允许呼出</label><p>按住 Ctrl+Alt，移向操作后松开任一键执行；中心、Esc 或右键取消。也可配置 Control+Alt+Space／字母／数字／F1–F12，可加 Shift。AltGr 不呼出；继续输入其他快捷键会取消，默认不干扰全屏应用。</p><label v-for="(slot,index) in draft.wheel.slots" :key="index">轮盘位置 {{ index+1 }}<select :value="slot" @change="moveSlot(index,($event.target as HTMLSelectElement).value)"><option v-for="key in wheelCommands" :key="key" :value="key">{{ wheelLabels[key] }}</option></select></label></template>
      <button type="button" :disabled="model.busy" @click="save">{{ model.busy?'保存中…':'保存桌面音乐设置' }}</button>
      <button type="button" :disabled="model.busy" @click="resetShortcuts">恢复默认快捷键</button>
    </template>
  </details>
</template>
<script setup lang="ts">
import {ref,watch} from 'vue';
import type {DesktopMusicSettings} from '@studyroom/contracts';
import {DESKTOP_WHEEL_COMMANDS,type DesktopWheelCommand} from '@studyroom/contracts';
import {desktopMusicState as model,saveDesktopMusic} from '../../audio/lyrics/desktopLyrics';
const desktop=Boolean(window.studyRoomDesktop),draft=ref<DesktopMusicSettings>();
const commands=[{key:'play-pause' as const,name:'播放／暂停'},{key:'previous' as const,name:'上一首'},{key:'next' as const,name:'下一首'}];
const wheelCommands=DESKTOP_WHEEL_COMMANDS,wheelLabels={ 'play-pause':'播放／暂停',next:'下一首',previous:'上一首',mute:'音乐静音',focus:'专注开始／暂停',sound:'声音面板',space:'返回空间',lyrics:'桌面歌词' };
function moveSlot(index:number,value:string){const slots=draft.value?.wheel?.slots;if(!slots||!(wheelCommands as readonly string[]).includes(value))return;const old=slots[index]!,from=slots.indexOf(value as DesktopWheelCommand);if(from<0)return;slots[index]=value as DesktopWheelCommand;slots[from]=old;}
watch(()=>model.state,state=>{if(state)draft.value=JSON.parse(JSON.stringify(state.settings));},{immediate:true});
function save(){if(draft.value)void saveDesktopMusic(JSON.parse(JSON.stringify(draft.value)));}
function resetShortcuts(){if(draft.value){draft.value.shortcuts={'play-pause':'MediaPlayPause',previous:'MediaPreviousTrack',next:'MediaNextTrack'};draft.value.shortcutsEnabled=true;save();}}
</script>
<style scoped>
.desktop-music{border-top:1px solid var(--sr-color-line);padding-top:12px;font-size:12px}.desktop-music summary{cursor:pointer;min-height:44px;display:flex;align-items:center}.desktop-music label{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;min-height:44px}.desktop-music input:not([type=checkbox]){width:min(100%,220px);padding:8px;border-radius:10px;border:1px solid var(--sr-color-line);background:var(--sr-color-surface-raised);color:inherit}.desktop-music input[type=checkbox]{accent-color:var(--sr-color-accent)}.desktop-music p{line-height:1.6;color:var(--sr-color-text-muted)}.desktop-music button{min-height:44px;padding:8px 12px;color:inherit;border:1px solid var(--sr-color-line);border-radius:12px;background:var(--sr-color-surface-raised)}
</style>
