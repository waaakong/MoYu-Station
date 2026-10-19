<template>
  <div class="composer-shell" @dragover.prevent @drop.prevent="drop">
    <StickerPanel v-if="stickersOpen" @close="stickersOpen=false" @insert="insertEmoji" @favorite="item=>{stickersOpen=false;$emit('send-sticker',item)}" />
    <MediaAttachments ref="attachments" v-show="media.items.length || media.state !== 'editing'" hide-toolbar :items="media.items" :enabled="mediaEnabled" :disabled="disabled" :locked="media.locked" :state="media.state" :completed="media.completed" :total="media.total"
      @add="$emit('add', $event)" @remove="$emit('remove', $event)" @retry="$emit('retry', $event)" @cancel="$emit('cancel', $event)" @reorder="$emit('reorder', $event)" @discard="$emit('discard')" />
    <div class="input-bar">
      <textarea ref="input" :value="modelValue" :disabled="disabled || media.locked" rows="2" maxlength="1000" :placeholder="placeholder"
        :aria-label="placeholder" @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @paste="paste"
        @compositionstart="composing = true" @compositionend="composing = false" @keydown="keydown" />
    </div>
    <div class="composer-toolbar">
      <div class="composer-tools" role="group" aria-label="消息工具">
        <button class="emoji-trigger tool-btn" type="button" aria-label="表情" title="表情" :disabled="disabled || media.locked" @click="openStickers"><AppIcon name="smile" /></button>
        <button class="tool-btn" type="button" aria-label="添加图片" :title="mediaEnabled ? '添加图片（最多 9 张）' : '图片上传暂未启用'" :disabled="disabled || media.locked || !mediaEnabled || media.items.length >= 9" @click="attachments?.openPicker()"><AppIcon name="image" /></button>
      </div>
      <span v-if="media.items.length" class="composer-hint">{{ media.items.length }}/9 张图片</span>
      <span v-else class="composer-hint keyboard-hint">Enter 发送 · Shift + Enter 换行</span>
      <button class="send-btn" type="button" :disabled="!canSubmit" @click="send">{{ media.state === 'sending' ? '发送中' : media.state === 'unknown' ? '查询并重试' : media.items.length ? '发送图片' : '发送' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import AppIcon from '../../components/icons/AppIcon.vue';
import type { StickerFavorite } from '@studyroom/contracts';
import StickerPanel from '../../stickers/StickerPanel.vue';
import MediaAttachments from '../../components/media/MediaAttachments.vue';
import type { UploadItem } from '../../media/imageUploadQueue';
const props = defineProps<{ modelValue: string; placeholder: string; disabled?: boolean; mediaEnabled: boolean;
  media: { items: UploadItem[]; locked: boolean; state: string; completed: number; total: number } }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; send: []; add: [files: File[]]; remove: [id: string]; retry: [id: string]; cancel: [id: string]; reorder: [ids: string[]]; discard: []; 'send-sticker':[item:StickerFavorite] }>();
const input=ref<HTMLTextAreaElement>(),stickersOpen=ref(false);let selection={start:0,end:0};
const attachments = ref<InstanceType<typeof MediaAttachments>>();
function openStickers(){selection={start:input.value?.selectionStart??props.modelValue.length,end:input.value?.selectionEnd??props.modelValue.length};stickersOpen.value=true;}
async function insertEmoji(text:string){const value=props.modelValue.slice(0,selection.start)+text+props.modelValue.slice(selection.end);if(value.length>1000)return;emit('update:modelValue',value);stickersOpen.value=false;await nextTick();input.value?.focus();input.value?.setSelectionRange(selection.start+text.length,selection.start+text.length);}
const canSubmit = computed(() => !props.disabled && (props.media.state === 'unknown' || props.media.state === 'editing' &&
  (props.media.items.length ? props.media.items.every(item => item.status === 'ready') : !!props.modelValue.trim())));
function send() { if (canSubmit.value) emit('send'); }
const composing = ref(false);
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || composing.value || event.keyCode === 229 || event.shiftKey
      || window.matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault(); send();
}
function add(files: File[]) { if (!props.disabled && !props.media.locked && props.mediaEnabled && files.length) emit('add', files); }
function drop(event: DragEvent) { add(Array.from(event.dataTransfer?.files || [])); }
function paste(event: ClipboardEvent) { const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); add(files); } }
</script>

<style scoped>
.composer-shell{flex:0 0 auto;min-width:0;padding:0 14px}.input-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:8px 0 14px;border-top:1px solid rgba(255,255,255,.1)}
.emoji-trigger{min-height:36px;margin:4px 0;border:1px solid #ffffff25;border-radius:8px;padding:4px 12px;background:#ffffff0c;color:inherit;cursor:pointer}
textarea{min-width:0;min-height:58px;max-height:140px;resize:vertical;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:10px 12px;background:rgba(0,0,0,.2);color:#fff;font:inherit;font-size:14px;line-height:1.5}textarea:disabled{opacity:.5}textarea:focus-visible{outline:2px solid #c7dfce;outline-offset:2px}
.plus-btn,.send-btn{height:44px;border:0;border-radius:999px;font:950 13px inherit;cursor:pointer;transition:transform 180ms ease,background 180ms ease,opacity 180ms ease}.plus-btn{width:44px;display:grid;place-items:center;background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.12);font-size:24px;line-height:1}.send-btn{padding:0 18px;background:rgba(255,255,255,.92);color:#111}.plus-btn:hover,.send-btn:hover:not(:disabled){transform:translateY(-1px);background:#fff;color:#111}.send-btn:disabled,.plus-btn:disabled{opacity:.5;cursor:not-allowed}
</style>
<style scoped>
.composer-shell{margin:0 10px 10px;padding:12px 14px 6px;background:rgba(18,24,25,.16);border:1px solid var(--sr-color-line);border-radius:14px;transition:border-color var(--sr-motion-fast) ease}
.composer-shell:focus-within{border-color:var(--sr-color-line-strong)}
.input-bar{display:block;padding:0;border:0}
.composer-toolbar{display:flex;align-items:center;gap:12px;min-height:44px}
.composer-tools{display:flex;align-items:center;gap:2px;margin-left:-6px;margin-right:auto}
.tool-btn,.emoji-trigger{display:grid;place-items:center;width:40px;height:44px;min-height:44px;border:0;border-radius:10px;margin:0;padding:0;color:var(--sr-color-text-muted);background:transparent;cursor:pointer}
.tool-btn:disabled{opacity:.4;cursor:not-allowed}
.composer-hint{font-size:11px;color:var(--sr-color-text-muted)}
textarea{display:block;width:100%;border:0;border-radius:6px;min-height:84px;height:84px;max-height:140px;padding:2px 4px 12px;color:var(--sr-color-text);background:transparent;font-size:14px;line-height:1.7;resize:none;outline:0}
textarea:focus-visible{outline:0}
.composer-shell:has(textarea:focus-visible){outline:2px solid var(--sr-color-focus);outline-offset:-2px}
.composer-shell :deep(.attachment-grid){max-height:180px;margin-top:0;grid-template-columns:repeat(3,minmax(0,1fr));overscroll-behavior:contain}
.composer-shell :deep(.attachment-grid img),.composer-shell :deep(.no-preview){height:64px}
.composer-shell :deep(.attachment-status){min-height:0;margin:4px 6px}
.composer-shell :deep(.attachment-grid li){border-color:var(--sr-color-line-strong);background:var(--sr-color-surface-raised)}
.composer-shell :deep(.attachment-actions button){background:transparent;border-color:var(--sr-color-line-strong);color:var(--sr-color-text)}
.composer-shell :deep(.media-attachments){padding:0 0 8px}
textarea::placeholder{color:var(--sr-color-text-muted)}
.send-btn{height:36px;min-width:64px;border-radius:10px;font-size:13px;font-weight:600;background:var(--sr-color-accent);color:var(--sr-color-accent-ink);transition:background-color var(--sr-motion-fast) ease;white-space:nowrap}
.send-btn:hover:not(:disabled){transform:none;background:var(--sr-color-accent)}
button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}
@media(hover:hover) and (pointer:fine){.tool-btn:hover:not(:disabled){background:var(--sr-color-selected);color:var(--sr-color-text)}.send-btn:not(:disabled):active{filter:brightness(.9)}}
@media(max-width:800px){.composer-shell{margin:0 8px 8px;padding:10px 10px 4px}textarea{font-size:16px;min-height:72px;height:72px}.send-btn{height:44px;padding:0 14px}.keyboard-hint{display:none}}
@media(pointer:coarse){.keyboard-hint{display:none}}
@media(max-width:600px){.composer-shell :deep(.attachment-grid){grid-template-columns:repeat(2,minmax(0,1fr))}.composer-shell :deep(.attachment-actions button){min-height:44px}}
@media(max-height:680px) and (min-width:801px){textarea{height:64px;min-height:64px}}
@media(prefers-reduced-motion:reduce){.composer-shell,.send-btn{transition:none}}
.sr-reduced-motion .composer-shell,.sr-reduced-motion .send-btn{transition:none}
</style>
