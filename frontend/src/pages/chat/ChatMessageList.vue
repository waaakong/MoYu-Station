<template>
  <div ref="container" :class="['messages', 'soft-scroll', { 'private-messages': privateMode }]" @scroll="rememberAndRead">
    <button v-if="hasOlder" class="history-more" type="button" :disabled="loadingOlder" @click="$emit('older')">{{ loadingOlder ? '加载中…' : '加载更早消息' }}</button>
    <template v-for="(message, index) in messages" :key="message.id">
    <time v-if="showTime(index)" class="message-time" :datetime="message.createdAt">{{ displayTime(message.createdAt) }}</time>
    <article :data-message-id="message.id" :data-incoming="!message.mine && !message.recalled && !message.sendState" :class="['message', { mine: message.mine, 'is-recalled': message.recalled }]">
      <ChatAvatar v-if="!message.recalled" :url="message.senderAvatar || (message.mine ? auth.user?.avatarUrl : undefined)" />
      <div class="message-body">
      <small v-if="!privateMode && !message.mine && !message.recalled" class="sender-name">{{ message.senderName }}</small>
      <div class="bubble" :class="{ 'bubble--image': message.messageType === 'IMAGE' && !message.recalled }">
        <span v-if="privateMode && message.recalled" class="recall-line">{{ message.mine ? "你撤回了一条消息" : "对方撤回了一条消息" }}</span>
        <template v-else>
          <AnimatedSticker v-if="message.media?.animated && message.media.posterUrl" class="animated-message" :clear-url="message.media.clearUrl" :poster-url="message.media.posterUrl" :width="message.media.width" :height="message.media.height" alt="动态表情" />
          <MediaGrid v-else-if="message.messageType === 'IMAGE' && message.mediaUrl" class="chat-media"
            :urls="[message.mediaUrl]" :media="message.media ? [message.media] : []" label="聊天图片"
            @open="urls => $emit('open-image', urls[0])" />
          <span v-if="message.messageType === 'IMAGE' && message.content && message.content !== '图片消息'">{{ message.content }}</span>
          <span v-else-if="message.messageType !== 'IMAGE'">{{ message.content }}</span>
        </template>
      </div>
      <div class="message-meta">
        <span v-if="message.mine && !message.recalled && message.sendState" class="delivery-status" role="status">
          {{ message.sendState === 'sending' ? '发送中' : message.sendState === 'unconfirmed' ? '结果未确认，请勿重新输入发送' : '未发出' }}
          <button v-if="message.sendState !== 'sending'" type="button" class="retry-send" @click="$emit('retry-send', message)">重试原消息</button>
        </span>
        <span v-else-if="message.mine && message.clientMessageId && !message.recalled" class="delivery-status">已发送</span>
        <button v-if="privateMode && message.canRecall && !message.recalled" class="recall-btn" type="button" @click="$emit('recall', message)">撤回</button>
        <button v-if="privateMode && deletionEnabled && !message.sendState" class="delete-message-btn" type="button" @click="$emit('delete-message',message)">删除这条记录</button>
        <button v-if="favoritesEnabled && message.messageType==='IMAGE' && message.media && !message.recalled && !message.sendState" class="recall-btn" type="button" @click="$emit('favorite',message)">收藏表情</button>
      </div>
      </div>
    </article>
    </template>
    <div v-if="!messages.length" class="empty-note">{{ emptyText }}</div>
  </div>
</template>

<script setup lang="ts">
import MediaGrid from "../../components/media/MediaGrid.vue";
import AnimatedSticker from '../../components/media/AnimatedSticker.vue';
import ChatAvatar from './ChatAvatar.vue';
import type { MediaDescriptor } from '@studyroom/contracts';
import { nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, onUpdated, ref } from "vue";
import { chatMemory, type ReadingAnchor } from '../../chat/chatMemory';
import { useAuthStore } from '../../stores/auth';
type Message = { id: string | number; clientMessageId?: string; sendState?: 'sending' | 'unconfirmed' | 'failed'; mine?: boolean; senderName?: string; senderAvatar?: string; createdAt?: string; messageType?: string; content?: string; mediaUrl?: string; media?: MediaDescriptor; recalled?: boolean; canRecall?: boolean };
const props = withDefaults(defineProps<{ messages: Message[]; privateMode?: boolean; deletionEnabled?:boolean; emptyText: string; conversationKey?: string; hasOlder?: boolean; loadingOlder?: boolean; readable?: boolean; favoritesEnabled?:boolean }>(), { privateMode: false, readable: true });
const emit = defineEmits<{ "open-image": [url?: string]; recall: [message: Message]; 'delete-message':[message:Message]; 'retry-send': [message: Message]; older: []; read: [throughId: string];favorite:[message:Message] }>();
const container = ref<HTMLElement | null>(null);
const auth = useAuthStore(), generation = auth.sessionGeneration;
function showTime(index: number) {
  const current = props.messages[index]?.createdAt, previous = props.messages[index - 1]?.createdAt;
  if (!current) return false;
  if (!previous) return true;
  const delta = Date.parse(current) - Date.parse(previous);
  return Number.isFinite(delta) ? Math.abs(delta) >= 5 * 60 * 1000 : current !== previous;
}
function displayTime(value?: string) { return (value || '').replace('T', ' ').replace(/:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/, ''); }
let frame = 0, mounted = false;
let anchor: ReadingAnchor | undefined;
let resize: ResizeObserver | undefined;
function capture(): ReadingAnchor | undefined {
  const el = container.value; if (!el || !el.clientHeight) return anchor;
  const bounds = el.getBoundingClientRect();
  const first = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(row => row.getBoundingClientRect().bottom > bounds.top);
  return { id: first?.dataset.messageId || '', offset: first ? first.getBoundingClientRect().top - bounds.top : 0, bottom: el.scrollHeight - el.scrollTop - el.clientHeight < 40 };
}
function remember() {
  if (generation !== auth.sessionGeneration) return;
  anchor = capture();
  if (props.conversationKey && anchor) chatMemory.anchors[props.conversationKey] = anchor;
}
function restore() {
  const el = container.value; if (!el || !el.clientHeight) return;
  if (!anchor || anchor.bottom) el.scrollTop = el.scrollHeight;
  else {
    const rows=[...el.querySelectorAll<HTMLElement>('[data-message-id]')];
    const row = rows.find(item => item.dataset.messageId === anchor?.id)
      || (/^[0-9]+$/.test(anchor.id)?rows.find(item=>/^[0-9]+$/.test(item.dataset.messageId||'') && BigInt(item.dataset.messageId!)>BigInt(anchor!.id)):undefined);
    if (row) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
  }
  scheduleRead();
}
function scheduleRead() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!props.privateMode || !props.readable || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const el = container.value; if (!el || !el.clientHeight) return;
    const bounds = el.getBoundingClientRect(); let through = 0n;
    for (const row of el.querySelectorAll<HTMLElement>('[data-incoming="true"]')) {
      const rect = row.getBoundingClientRect(), visible = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
      const raw=row.dataset.messageId||'';if(!/^[1-9][0-9]{0,18}$/.test(raw))continue;
      const id = BigInt(raw);
      if (visible >= Math.min(rect.height, bounds.height) * .9 && id>through) through=id;
    }
    if (through) emit('read', String(through));
  });
}
function rememberAndRead() { remember(); scheduleRead(); }
function scrollToBottom() { anchor = { id: '', offset: 0, bottom: true }; restore(); }
onBeforeUpdate(() => { if (mounted && props.messages.length) remember(); });
onUpdated(restore);
onMounted(async () => {
  anchor = props.conversationKey ? chatMemory.anchors[props.conversationKey] : undefined;
  await nextTick(); mounted = true; restore();
  resize = new ResizeObserver(restore);
  if (container.value) resize.observe(container.value);
  window.addEventListener('focus', scheduleRead); document.addEventListener('visibilitychange', scheduleRead);
});
onBeforeUnmount(() => {
  remember(); cancelAnimationFrame(frame); resize?.disconnect();
  window.removeEventListener('focus', scheduleRead); document.removeEventListener('visibilitychange', scheduleRead);
});
defineExpose({ scrollToBottom, remember });
</script>

<style scoped>
.messages{flex:1 1 0;min-height:0;overflow:auto;padding:20px;box-sizing:border-box}
.delete-message-btn{justify-self:end;min-height:44px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;opacity:.75}
.animated-message{display:block;max-width:min(240px,100%);max-height:240px;object-fit:contain}
/* Historical rows must have stable geometry while the reading anchor is restored. */
.messages .message{animation:none}
.history-more{display:block;margin:0 auto 18px;min-height:40px;padding:6px 16px;border:1px solid #ffffff33;border-radius:12px;background:#ffffff12;color:inherit;cursor:pointer}
.message{display:flex;margin-bottom:15px;animation:messageIn 260ms ease both}.message.mine{justify-content:flex-end}.bubble{position:relative;max-width:78%;display:grid;gap:7px;padding:12px 14px;border-radius:18px 18px 18px 6px;background:rgba(255,255,255,.105);color:#fff;line-height:1.6;font-size:14px;font-weight:720;overflow-wrap:anywhere}.message.mine .bubble{border-radius:18px 18px 6px 18px;background:rgba(225,239,229,.92);color:#172019}.bubble small{color:rgba(255,255,255,.55);font-size:11px;font-weight:850}.message.mine .bubble small{color:rgba(23,32,25,.56)}
.image-message{display:block;max-width:min(320px,100%);padding:0;border:0;border-radius:14px;background:transparent;cursor:zoom-in;overflow:hidden}.private-image-message{max-width:min(190px,100%)}.image-message img{display:block;width:100%;max-height:220px;object-fit:contain;border-radius:14px;background:rgba(0,0,0,.2)}.private-image-message img{max-height:180px}
.recall-line{font-size:12px;font-style:italic;opacity:.7}.recall-btn{justify-self:end;border:0;padding:0;background:transparent;color:inherit;font-size:11px;opacity:.58;cursor:pointer}.empty-note{padding:22px;color:rgba(255,255,255,.62);text-align:center;line-height:1.8;font-weight:760}
.chat-media{width:min(320px,100%);margin-bottom:0}.private-messages .chat-media{width:min(240px,100%)}
.bubble>span{white-space:pre-wrap}.delivery-status{font-size:11px;line-height:1.6}.retry-send{display:block;min-height:36px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;cursor:pointer;margin-top:4px}
@media(prefers-reduced-motion:reduce){.message{animation:none}}
.soft-scroll{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.34) transparent}.soft-scroll::-webkit-scrollbar{width:5px}.soft-scroll::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(255,255,255,.28)}
@keyframes messageIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>
<style scoped>
.messages{padding:20px 24px;overscroll-behavior:contain;scrollbar-gutter:stable}
.message{margin-bottom:16px;animation:none}
.bubble{max-width:min(78%,620px);padding:12px 16px;font-weight:400;line-height:1.75;background:var(--sr-color-surface-raised);border:1px solid var(--sr-color-line);color:var(--sr-color-text)}
.bubble small{font-size:12px;font-weight:400;color:var(--sr-color-text-muted)}
.message.mine .bubble{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent}
.message.mine .bubble small{color:#4c5a6e}
.history-more{min-height:44px;color:var(--sr-color-text-muted);border-radius:var(--sr-radius-control)}
.recall-btn{min-height:32px;padding:0 8px;border-radius:8px;font-size:12px;opacity:.85}
.delivery-status{font-size:12px}
.recall-btn:focus-visible,.retry-send:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media(max-width:800px){.messages{padding:16px 12px}.bubble{max-width:88%;padding:10px 13px}}
@media(pointer:coarse){.recall-btn{min-height:44px}.retry-send{min-height:44px}}
.message{align-items:flex-start;gap:10px;margin-bottom:20px}
.message.mine{flex-direction:row-reverse;justify-content:flex-start}
.message-body{display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:min(76%,620px)}
.mine .message-body{align-items:flex-end}
.sender-name{margin:0 0 6px 2px;font-size:11px;line-height:1.4;color:var(--sr-color-text-muted)}
.message-time{display:block;text-align:center;margin:8px 0 22px;font-size:11px;color:var(--sr-color-text-muted);font-variant-numeric:tabular-nums}
.bubble{max-width:100%;box-sizing:border-box;border-radius:4px 14px 14px;padding:9px 13px;font-size:14px;line-height:1.65}
.message.mine .bubble{border-radius:14px 4px 14px 14px}
.bubble.bubble--image,.message.mine .bubble.bubble--image{padding:0;background:transparent;border:0;color:var(--sr-color-text);overflow:hidden}
.bubble--image .chat-media{width:240px;max-width:100%;margin:0}
.bubble--image :deep(.media-tile){background:var(--sr-color-surface-raised)}
.bubble--image>span{padding:8px 10px;background:var(--sr-color-surface-raised);border-radius:10px}
.message-meta{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;color:var(--sr-color-text-muted);font-size:11px;max-width:100%}
.message-meta:empty{display:none}
.mine .message-meta{justify-content:flex-end}
.delivery-status{font-size:11px;white-space:normal}
.recall-btn,.delete-message-btn{padding:0;min-height:32px;font-size:11px;opacity:1}
.message.is-recalled{justify-content:center}
.is-recalled .bubble{background:transparent;border:0;padding:0;color:var(--sr-color-text-muted);text-align:center}
.empty-note{display:grid;place-items:center;min-height:65%;font-size:13px;font-weight:400}
@media(max-width:800px){.message{gap:8px}.message-body{max-width:calc(100% - 70px)}.bubble{padding:9px 12px}.message :deep(.chat-avatar){width:34px;height:34px;border-radius:10px}.message-meta button{min-height:44px}}
</style>
