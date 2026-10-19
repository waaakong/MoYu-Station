<template>
  <section class="media-attachments" aria-label="图片附件" @dragover.prevent @drop.stop.prevent="drop" @paste="paste">
    <div v-show="!hideToolbar" class="attachment-toolbar">
      <button type="button" :disabled="disabled || locked || !enabled || items.length >= 9" @click="input?.click()">添加图片</button>
      <span>{{ enabled ? `${items.length}/9 · 单图处理后不超过 2 MiB` : '图片上传暂未启用，可发送文字' }}</span>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="pick" />
    </div>
    <ol v-if="items.length" class="attachment-grid">
      <li v-for="(item, index) in items" :key="item.id" :data-attachment-id="item.id" :draggable="!locked && !disabled"
        @dragstart="dragId = item.id" @dragend="dragId = ''" @dragover.prevent @drop.stop.prevent="reorder(item.id)">
        <img v-if="item.previewUrl" :src="item.previewUrl" :alt="`第 ${index + 1} 张图片预览`" draggable="false" />
        <div v-else class="no-preview">{{ item.status === 'cancelled' ? '已取消' : item.status === 'failed' ? '无法生成预览' : '处理后显示预览' }}</div>
        <span class="image-position">{{ index + 1 }}</span>
        <p class="attachment-status" role="status">{{ label(item) }}</p>
        <div class="attachment-actions">
          <button type="button" :aria-label="`将第 ${index + 1} 张图片前移`" :disabled="locked || disabled || index === 0" @click="move(item.id, -1)">前移</button>
          <button type="button" :aria-label="`将第 ${index + 1} 张图片后移`" :disabled="locked || disabled || index === items.length - 1" @click="move(item.id, 1)">后移</button>
          <button v-if="item.status === 'failed' && !terminal(item)" type="button" :disabled="locked || disabled" @click="emit('retry', item.id)">{{ item.error === 'OUTCOME_UNKNOWN' ? '查询重试' : '重试' }}</button>
          <button v-if="['queued','processing','uploading'].includes(item.status)" type="button" :disabled="locked" @click="emit('cancel', item.id)">取消</button>
          <button type="button" :aria-label="`删除第 ${index + 1} 张图片`" :disabled="locked" @click="emit('remove', item.id)">删除</button>
        </div>
      </li>
    </ol>
    <p v-if="state !== 'editing'" class="publication-status" role="status">
      {{ state === 'sending' ? '正在提交原任务…' : state === 'unknown' ? '结果待确认，请查询并重试原任务。内容、收件人与顺序已锁定。' : state === 'rejected' ? '发布被拒绝，请清除本地草稿后处理图片或权限问题。' : '发布已确认。' }}
      <span v-if="total > 1">已确认 {{ completed }}/{{ total }} 条</span>
    </p>
    <button v-if="locked && state !== 'sending'" class="discard-task" type="button" @click="emit('discard')">清除本地任务</button>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { UploadItem } from '../../media/imageUploadQueue';
const props = withDefaults(defineProps<{ items: UploadItem[]; enabled: boolean; disabled?: boolean; locked?: boolean; state?: string; completed?: number; total?: number; hideToolbar?: boolean }>(), { state: 'editing', completed: 0, total: 0 });
const emit = defineEmits<{ add: [files: File[]]; remove: [id: string]; retry: [id: string]; cancel: [id: string]; reorder: [ids: string[]]; discard: [] }>();
const input = ref<HTMLInputElement>(), dragId = ref('');
function openPicker() { if (!props.disabled && !props.locked && props.enabled && props.items.length < 9) input.value?.click(); }
defineExpose({ openPicker });
let active = true;
onBeforeUnmount(() => { active = false; });
const terminal = (item: UploadItem) => ['ASSET_EXPIRED','ASSET_BOUND','UPLOAD_TERMINAL'].includes(item.error || '');
function label(item: UploadItem) {
  if (item.detail) return item.detail;
  if (item.error) return ({ PROCESSING_FAILED: '处理失败，可重试或换图', UPLOAD_REJECTED: '上传失败，可重试', OUTCOME_UNKNOWN: '上传结果待确认', ASSET_EXPIRED: '图片已过期，请删除重加', ASSET_BOUND: '图片已被使用，请确认发布记录', UPLOAD_TERMINAL: '此图片不能重试，请删除重加' })[item.error];
  return ({ queued: '排队中', processing: '图片处理中', uploading: item.phase === 'lookup' ? '查询上传结果中' : '上传中', ready: '已就绪', cancelled: '已取消', failed: '失败' })[item.status];
}
function add(files: File[]) { if (active && !props.disabled && !props.locked && props.enabled && files.length) emit('add', files); }
function pick(event: Event) { const target = event.target as HTMLInputElement; add(Array.from(target.files || [])); target.value = ''; }
function drop(event: DragEvent) { dragId.value = ''; add(Array.from(event.dataTransfer?.files || [])); }
function paste(event: ClipboardEvent) { const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); add(files); } }
function move(id: string, direction: number) {
  const ids = props.items.map(item => item.id), from = ids.indexOf(id), to = from + direction;
  if (props.locked || props.disabled || from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(from, 1); ids.splice(to, 0, id); emit('reorder', ids);
}
function reorder(id: string) {
  const ids = props.items.map(item => item.id), from = ids.indexOf(dragId.value), to = ids.indexOf(id); dragId.value = '';
  if (props.locked || props.disabled || from < 0 || to < 0 || from === to) return;
  const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved); emit('reorder', ids);
}
</script>

<style scoped>
.media-attachments{min-width:0;padding:12px 0;color:#f4f5f0}.attachment-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.attachment-toolbar span{font-size:12px;color:#d1d7d1}.media-attachments button{min-height:32px;border:1px solid #758378;border-radius:8px;background:#26372ee8;color:#fff;padding:5px 10px;cursor:pointer;font:inherit;font-size:12px}.media-attachments button:disabled{opacity:.45;cursor:default}.media-attachments button:focus-visible{outline:2px solid #fff;outline-offset:2px}.attachment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:4px 0;margin:10px 0 0;list-style:none;max-height:300px;overflow:auto}.attachment-grid li{position:relative;min-width:0;border:1px solid #788b7a;border-radius:10px;overflow:hidden;background:#16251ee8}.attachment-grid img,.no-preview{display:block;width:100%;height:82px;object-fit:cover}.no-preview{display:grid;place-items:center;font-size:12px}.image-position{position:absolute;top:4px;left:4px;background:#102219dd;border-radius:4px;padding:1px 5px;font-size:12px}.attachment-status{font-size:12px;line-height:1.5;overflow-wrap:anywhere;min-height:36px;margin:6px}.attachment-actions{display:flex;gap:4px;flex-wrap:wrap;padding:0 5px 6px}.attachment-actions button{padding:3px 5px;flex:1;white-space:nowrap}.publication-status{font-size:13px;line-height:1.6;color:#ffe8b5;overflow-wrap:anywhere}.publication-status span{display:block}.discard-task{margin-top:4px}.media-attachments{transition:none}@media(max-width:600px){.attachment-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
