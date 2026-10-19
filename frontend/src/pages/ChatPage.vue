<template>
  <main class="chat-page">
    <div class="chat-frame" :style="frameStyle">
      <div class="chat-bg" :style="backgroundStyle" aria-hidden="true"></div>

      <header class="topbar">
        <nav class="nav-tabs" aria-label="主导航">
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            :class="['nav-item', { active: item.key === 'chat' }]"
            @click="goNav(item)"
          >
            {{ item.label }}
          </button>
        </nav>
      </header>

      <section data-motion-group :class="['chat-shell', { 'conversation-open': conversationOpen }]">
        <aside class="conversation-list glass sr-glass" aria-label="会话列表">
          <div class="panel-head"><h2>聊天</h2><button class="history-delete-btn refresh-conversations" type="button" aria-label="刷新会话" title="刷新会话" :disabled="conversationLoading" @click="loadConversations(true)"><AppIcon name="refresh" /></button></div>
          <div class="conversation-scroll">
            <button class="conversation-row" :class="{ active: !activeUserId }" :aria-pressed="!activeUserId" type="button" @click="openHall"><ChatAvatar hall /><span class="conversation-copy"><strong>大厅公共频道</strong><small>{{ socketLabel }}</small></span></button>
            <button v-for="user in displayUsers" :key="user.id" class="conversation-row" :class="{ active: String(activeUserId) === String(user.id) }" :aria-pressed="String(activeUserId) === String(user.id)" type="button" @click="openPrivate(user)">
              <ChatAvatar :url="user.avatarUrl" />
              <span class="conversation-copy"><strong>{{ user.nickname || user.username }}</strong><small>{{ user.preview || statusText(user.onlineStatus) }}</small></span>
              <span class="conversation-meta"><time v-if="user.updatedAt" :title="user.updatedAt">{{ conversationTime(user.updatedAt) }}</time><span v-if="unreadCount(user.id)" class="conversation-unread" :aria-label="`${unreadCount(user.id)} 条未读`">{{ unreadCount(user.id) > 99 ? '99+' : unreadCount(user.id) }}</span></span>
            </button>
            <p v-if="conversationError" class="conversation-error" role="alert">{{ conversationError }}</p>
            <button v-if="conversationCursor" class="conversation-row" type="button" :disabled="conversationLoading" @click="loadConversations(false)">{{ conversationLoading ? '加载中…' : '更多会话' }}</button>
            <p v-if="!displayUsers.length && !conversationLoading" class="empty-note">还没有私聊，在线用户会在这里出现。</p>
          </div>
        </aside>

        <section v-if="!activeUserId" class="hall-panel glass sr-glass sr-glass--reading active-conversation">
          <div class="panel-head">
            <button class="back-to-list" type="button" @click="conversationOpen = false">返回会话</button>
            <div>
              <div class="eyebrow">PUBLIC CHANNEL</div>
              <h2>大厅公共频道</h2>
            </div>
            <span :class="['badge', 'socket-badge', socketState]">{{ socketLabel }}</span>
          </div>

          <div v-if="isMuted" class="restriction-note">你当前处于禁言状态，可以查看消息，但暂时无法发言。</div>

          <ChatMessageList :favorites-enabled="stickerSession.enabled" @favorite="favoriteMessage" ref="hallMessagesEl" conversation-key="hall" :messages="visibleHallMessages" :has-older="historyMore.hall !== false" :loading-older="historyLoading.hall" @older="loadOlder(hallTarget)" empty-text="大厅还没有消息。" @open-image="url => openImageViewer([url], 0)" @retry-send="retryText" />

          <ChatComposer v-model="hallDraft" placeholder="在大厅说点什么..." :disabled="isMuted" :media-enabled="media.enabled" :media="hallMedia"
            @send="sendHallText" @send-sticker="item=>sendSticker(item, hallTarget)" @add="files => mediaAction(hallTarget, 'add', files)" @remove="id => mediaAction(hallTarget, 'remove', id)"
            @retry="id => mediaAction(hallTarget, 'retry', id)" @cancel="id => mediaAction(hallTarget, 'cancel', id)" @reorder="ids => mediaAction(hallTarget, 'reorder', ids)" @discard="discardMedia(hallTarget)" />
        </section>

        <section v-else :class="['dm-panel', 'glass', 'sr-glass', 'sr-glass--reading', 'active-conversation', { 'has-chat': activeUser }]">
          <div class="panel-head">
            <button class="back-to-list" type="button" @click="conversationOpen = false">返回会话</button>
            <div>
              <div class="eyebrow">PRIVATE CHAT</div>
              <h3>{{ activeUser ? activeUser.nickname || activeUser.username : '私聊' }}</h3>
            </div>
            <span :class="['badge', 'status-badge', statusClass(activeUser?.onlineStatus)]">
              {{ activeUser ? statusText(activeUser.onlineStatus) : '未选择' }}
            </span>
            <button v-if="activeUser" class="history-delete-btn" type="button" @click="deleteActivePrivateHistory">
              删除记录
            </button>
          </div>

          <div v-if="!activeUser" class="dm-empty">
            <p>选择左侧用户开始私聊。</p>
            <p>私聊记录会保存在你的账号里。</p>
          </div>

          <template v-else>
            <ChatMessageList :deletion-enabled="privateDeletionAvailable" @delete-message="askDeleteMessage" :favorites-enabled="stickerSession.enabled" @favorite="favoriteMessage" :key="activeUserId" ref="privateMessagesEl" :conversation-key="`private:${activeUserId}`" :messages="visiblePrivateMessages" private-mode :readable="!imageViewer.open && !deletionTarget" :has-older="historyMore[`private:${activeUserId}`] !== false" :loading-older="historyLoading[`private:${activeUserId}`]" @older="loadOlder(privateTarget)" @read="readVisible" empty-text="还没有聊天记录，先打个招呼。" @open-image="url => openImageViewer([url], 0)" @recall="recallMessage" @retry-send="retryText" />

            <ChatComposer :key="activeUser.id" v-model="privateDraft" placeholder="发送私信..." :disabled="isMuted" :media-enabled="media.enabled" :media="privateMedia"
              @send="sendPrivateText" @send-sticker="item=>sendSticker(item, privateTarget)" @add="files => mediaAction(privateTarget, 'add', files)" @remove="id => mediaAction(privateTarget, 'remove', id)"
              @retry="id => mediaAction(privateTarget, 'retry', id)" @cancel="id => mediaAction(privateTarget, 'cancel', id)" @reorder="ids => mediaAction(privateTarget, 'reorder', ids)" @discard="discardMedia(privateTarget)" />
          </template>
        </section>
      </section>

      <section :class="['toast', 'sr-glass', 'sr-glass--floating', { show: toast.show }]" aria-live="polite">
        <strong>{{ toast.title }}</strong>
        <p>{{ toast.text }}</p>
        <button v-if="toast.userId" class="send-btn" type="button" @click="openToastPrivate">查看私聊</button>
      </section>

      <ImageViewer v-if="imageViewer.open" :images="imageViewer.images.map(assetUrl)" :initial-index="imageViewer.index" @close="closeImageViewer" />
      <dialog ref="deletionDialog" class="message-delete-dialog sr-glass sr-glass--floating" aria-labelledby="message-delete-title" @close="deletionTarget=null">
        <h2 id="message-delete-title">删除这条记录？</h2>
        <p>{{ deletionTarget?.name }} · {{ deletionTarget?.summary }}</p>
        <p>仅从你的账号聊天记录中删除，对方仍可见。这不是撤回，删除后不能在此恢复。</p>
        <p v-if="deletionError" role="alert">{{ deletionError }}</p>
        <div><button type="button" autofocus @click="closeMotionDialog(deletionDialog)">取消</button><button type="button" :disabled="deletionBusy" @click="confirmDeleteMessage">{{ deletionBusy?'正在确认…':deletionError?'重试原删除':'确认删除' }}</button></div>
      </dialog>

    </div>
  </main>
</template>

<script setup>
import { openMotionDialog, closeMotionDialog } from '../motion/runtime';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from "vue";
import { chatMemory, textOutbox,hidePrivateMessage } from '../chat/chatMemory';
import { catchUpMessages } from '../chat/catchUp';
import { pendingStickers,createStickerSend,submitSticker,acknowledgeSticker } from '../chat/stickerOutbox';
import { MediaApi } from '../media/mediaApi';
import { stickerApi } from '../stickers/api';
import { stickerSession } from '../stickers/session';
import { useRouter, useRoute } from "vue-router";
import { messageNotices } from '../notifications/state';
import { entityId } from '../notifications/messagePolicy';
import { cloudMediaUrl as assetUrl } from "../utils/cloudMedia";
import ImageViewer from "../components/media/ImageViewer.vue";
import ChatComposer from "./chat/ChatComposer.vue";
import ChatMessageList from "./chat/ChatMessageList.vue";
import ChatAvatar from './chat/ChatAvatar.vue';
import AppIcon from '../components/icons/AppIcon.vue';
import { dedupeMessages, lastMessageId, mergeMessages } from "../chat/messageMerge";
import { useAuthStore } from "../stores/auth";
import { scenes, timeFromSystem } from "../data/scenes";
import { useMediaDrafts } from "../media/useMediaDrafts";
import {
  createChatSocket,
  deletePrivateMessages,
  deletePrivateMessage,fetchPrivateVisibility,
  fetchHallMessages,
  fetchChatCapabilities,
  fetchConversations,
  fetchOnlineUsers,
  fetchPrivateMessages,
  fetchPrivateUnread,
  markPrivateRead,
  recallPrivateMessage,
  updateChatStatus
} from "../services/chat";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const media = useMediaDrafts();
const stickers = stickerApi();
const hallTarget = Object.freeze({ kind: 'hall' });
const privateTarget = computed(() => ({ kind: 'private', recipientId: String(activeUserId.value) }));
const hallMedia = computed(() => media.snapshot(hallTarget));
const privateMedia = computed(() => media.snapshot(privateTarget.value));
let disposed = false;
function sessionGuard() { const generation = authStore.sessionGeneration, owner = authStore.user?.id; return () => !disposed && generation === authStore.sessionGeneration && owner === authStore.user?.id; }

const socket = ref(null);
const pingTimer = ref(0);
const socketState = ref("connecting");
const conversationOpen = ref(false);
const conversationSummaries = ref([]);
const selectedUsers = reactive({});
const conversationCursor = ref(null), conversationLoading = ref(false), conversationError = ref('');
let conversationRequest = 0;
const historyMore = reactive({}), historyLoading = reactive({}), readThrough = reactive({});
const reading = new Set();
const boundedReadAvailable = ref(false);
const privateDeletionAvailable=ref(false),deletionDialog=ref(null),deletionTarget=ref(null),deletionBusy=ref(false),deletionError=ref('');
function mergePrivate(current,incoming){return mergeMessages(current,incoming).filter(message=>!chatMemory.deletedIds.has(String(message.id)));}
async function reconcilePrivate(peer,current){
  if(!privateDeletionAvailable.value)return;
  const ids=(privateRecords[peer]||[]).map(message=>String(message.id));
  for(let index=0;index<ids.length;index+=80){
    const group=ids.slice(index,index+80),visible=new Set(await fetchPrivateVisibility(peer,group));
    if(!current())return;
    for(const id of group)if(!visible.has(id))hidePrivateMessage(id,String(peer));
  }
}
function askDeleteMessage(message){
  if(!privateDeletionAvailable.value || message.sendState || !activeUser.value)return;
  deletionTarget.value={id:String(message.id),peer:String(activeUserId.value),name:activeUser.value.nickname||activeUser.value.username,summary:message.messageType==='IMAGE'?'图片消息':String(message.content||'消息').slice(0,80),current:sessionGuard()};
  deletionError.value='';openMotionDialog(deletionDialog.value);
}
async function confirmDeleteMessage(){
  const target=deletionTarget.value;if(!target || deletionBusy.value || !target.current())return;
  deletionBusy.value=true;
  try{
    await deletePrivateMessage(target.id);if(!target.current())return;
    hidePrivateMessage(target.id,target.peer);closeImageViewer();
    if(deletionTarget.value===target)closeMotionDialog(deletionDialog.value);
    await Promise.all([loadConversations(true),fetchPrivateUnread().then(items=>{if(target.current())applyUnread(items);})]);
  }catch(error){if(target.current() && deletionTarget.value===target)deletionError.value=error?.message||'结果未确认，请重试原删除；不会更换目标。';}
  finally{deletionBusy.value=false;}
}
const onlineUsers = ref([]);
const hallMessages = toRef(chatMemory, 'hall');
const privateRecords = chatMemory.records;
const unreadMap = reactive({});
const activeUserId = toRef(chatMemory, 'activeUserId');
const narrowConversation = ref(window.matchMedia('(max-width: 800px)').matches);
const syncConversationWidth = () => { narrowConversation.value = window.matchMedia('(max-width: 800px)').matches; };
watch([activeUserId, conversationOpen, narrowConversation], ([peer, open, narrow]) => { messageNotices.activePeer = peer && (open || !narrow) ? String(peer) : null; }, { immediate: true, flush: 'sync' });
const hallDraft = toRef(chatMemory, 'hallDraft');
const privateDrafts = chatMemory.privateDrafts;
const reliableTextAvailable = ref(false);
const privateDraft = computed({
  get: () => privateDrafts[activeUserId.value] || "",
  set: value => { if (activeUserId.value != null) privateDrafts[activeUserId.value] = value; }
});
const hallMessagesEl = ref(null);
const privateMessagesEl = ref(null);
const toast = reactive({ show: false, title: "", text: "", userId: null });
const imageViewer = reactive({
  open: false,
  images: [],
  index: 0
});
watch(()=>authStore.sessionGeneration,()=>{closeMotionDialog(deletionDialog.value, true);deletionTarget.value=null;closeImageViewer();});

let toastTimer = 0;

const navItems = computed(() => {
  const items = [
    { key: "scene", label: "场景", route: "scene" },
    { key: "focus", label: "专注", route: "focus" },
    { key: "entertainment", label: "娱乐", route: "entertainment" },
    { key: "chat", label: "聊天", route: "chat" },
    { key: "feed", label: "动态", route: "feed" },
    { key: "profile", label: "我的", route: "profile" }
  ];
  if (authStore.isAdmin) {
    items.splice(5, 0, { key: "admin", label: "管理", route: "admin" });
  }
  return items;
});

const isMuted = computed(() => authStore.userRole === "MUTED");
const displayUsers = computed(() => {
  const rows = new Map(conversationSummaries.value.map(item => [String(item.userId), { ...item, id: String(item.userId) }]));
  for (const user of onlineUsers.value) if (String(user.id) !== String(authStore.user?.id)) rows.set(String(user.id), { ...rows.get(String(user.id)), ...user });
  return [...rows.values()];
});
const activeUser = computed(() => displayUsers.value.find((user) => String(user.id) === String(activeUserId.value)) || selectedUsers[activeUserId.value]);
const privateMessages = computed(() => privateRecords[activeUserId.value] || []);
const visibleHallMessages = computed(() => [...hallMessages.value, ...chatMemory.pending.filter(item => item.channelType === 'HALL'),...pendingStickers.filter(item=>item.channelType==='HALL')]);
const visiblePrivateMessages = computed(() => [...privateMessages.value, ...chatMemory.pending.filter(item => item.channelType === 'PRIVATE' && String(item.receiverId) === String(activeUserId.value)),...pendingStickers.filter(item=>item.channelType==='PRIVATE' && String(item.receiverId)===String(activeUserId.value))]);
watch([hallMessages, privateRecords], () => {
  for (const message of [...hallMessages.value, ...Object.values(privateRecords).flat()]) {textOutbox.acknowledge(message);acknowledgeSticker(message);}
}, { deep: true });
const socketLabel = computed(() => {
  const labels = { open: "实时在线", connecting: "连接中", retrying: "重连中", offline: "网络不可用", closed: "已关闭" };
  return labels[socketState.value] || "连接中";
});
const frameStyle = computed(() => ({
  "--chat-nav-top": "30px",
  "--chat-nav-right": "46px",
  "--chat-shell-top": "112px"
}));
const backgroundStyle = computed(() => {
  const library = scenes.find((scene) => scene.key === "library") || scenes[0];
  const image = library?.images?.[timeFromSystem()] || library?.images?.night;
  return { backgroundImage: `url(${image})` };
});

async function goNav(item) {
  if (item.route === "chat") return;
  if (item.route === "entertainment") {
    await updateChatStatus("PLAYING").catch(() => {});
  } else if (item.route !== "focus") {
    await updateChatStatus("IDLE").catch(() => {});
  }
  router.push({ name: item.route });
}

function conversationTime(value) {
  // Preserve the server's displayed calendar time; do not infer a missing timezone.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
  return match ? `${match[2]}/${match[3]}` : String(value);
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "FOCUSING") return "focus";
  if (value === "PLAYING") return "play";
  if (value === "OFFLINE") return "offline";
  return "idle";
}

function statusText(status) {
  const value = String(status || "").toUpperCase();
  if (value === "FOCUSING") return "专注";
  if (value === "PLAYING") return "娱乐";
  if (value === "OFFLINE") return "离线";
  return "空闲";
}

function unreadCount(userId) {
  return unreadMap[userId] || 0;
}

function openHall() { activeUserId.value = null; conversationOpen.value = true; }
async function loadConversations(reset) {
  if (!reset && conversationLoading.value) return;
  const request = ++conversationRequest, current = sessionGuard();
  conversationLoading.value = true; conversationError.value = '';
  try {
    const page = await fetchConversations(reset ? undefined : conversationCursor.value);
    if (!current() || request !== conversationRequest) return;
    const rows = new Map((reset ? [] : conversationSummaries.value).map(row => [row.userId, row]));
    for (const row of page.items) { rows.set(row.userId, row); unreadMap[row.userId] = row.unreadCount; }
    conversationSummaries.value = [...rows.values()]; conversationCursor.value = page.nextCursor;
  } catch (error) { if (current() && request === conversationRequest) conversationError.value = error?.message || '会话加载失败，请刷新重试。'; }
  finally { if (current() && request === conversationRequest) conversationLoading.value = false; }
}
async function loadOlder(target) {
  const key = target.kind === 'hall' ? 'hall' : `private:${target.recipientId}`;
  if (historyLoading[key] || historyMore[key] === false) return;
  const records = target.kind === 'hall' ? hallMessages.value : privateRecords[target.recipientId] || [];
  const before = records.length ? String(records[0].id) : undefined;
  const current = sessionGuard(); historyLoading[key] = true;
  try {
    const older = target.kind === 'hall' ? await fetchHallMessages(undefined, before) : await fetchPrivateMessages(String(target.recipientId), undefined, before);
    if (!current()) return;
    if (target.kind === 'hall') hallMessages.value = mergeMessages(hallMessages.value, older);
    else privateRecords[target.recipientId] = mergePrivate(privateRecords[target.recipientId] || [], older);
    historyMore[key] = older.length === 80;
  } catch (error) { if (current()) showToast('历史加载失败', error?.message || '请重试，当前位置已保留。'); }
  finally { if (current()) historyLoading[key] = false; }
}
async function readVisible(throughId) {
  const recipient = activeUserId.value;
  if (!boundedReadAvailable.value || !recipient || !document.hasFocus() || document.visibilityState !== 'visible'
    || BigInt(readThrough[recipient] || 0) >= BigInt(throughId) || reading.has(recipient)) return;
  const current = sessionGuard(); reading.add(recipient);
  try {
    await markPrivateRead(recipient, throughId);
    if (!current()) return;
    readThrough[recipient] = throughId;
    // Re-fetch authoritative counts: ACK and a successful read request are not a zero-unread assertion.
    const unread = await fetchPrivateUnread();
    if (current()) applyUnread(unread);
  } catch { /* Keep the old watermark. A later visibility/scroll event can retry. */ }
  finally { reading.delete(recipient); }
}

async function loadInitialData() {
  const current = sessionGuard();
  try {
    const [users, unread, hall, capabilities] = await Promise.all([
      fetchOnlineUsers(),
      fetchPrivateUnread(),
      fetchHallMessages(),
      fetchChatCapabilities().catch(() => ({}))
    ]);
    if (!current()) return;
    onlineUsers.value = Array.isArray(users) ? users : [];
    reliableTextAvailable.value = capabilities.reliableText === true;
    boundedReadAvailable.value = capabilities.boundedRead === true;
    privateDeletionAvailable.value=capabilities.privateMessageDeletion===true;
    applyUnread(unread);
    hallMessages.value = mergeMessages(hallMessages.value, hall);
    historyMore.hall = hall.length === 80;
    await loadConversations(true);
    if (current() && activeUser.value) await openPrivate(activeUser.value, false);
  } catch (error) {
    if (!current()) return;
    onlineUsers.value = [];
    showToast("聊天数据加载失败", error?.message || "会继续尝试连接实时通道。");
  }
}

function connectSocket() {
  const current = sessionGuard();
  socket.value = createChatSocket({
    onOpen: async (recovered) => {
      if (!current()) return;
      sendSocket("STATUS_UPDATE", { onlineStatus: "IDLE" }, { silent: true });
      startPing();
      if (recovered) await recoverMissedMessages();
    },
    onMessage: event => { if (current()) handleSocketMessage(event); },
    onStateChange: (state) => {
      if (!current()) return;
      socketState.value = state;
      if (state !== "open") stopPing();
    }
  });
}

async function recoverMissedMessages() {
  const currentSession = sessionGuard();
  const recipientId = activeUserId.value;
  try {
    const hallAfterId = lastMessageId(hallMessages.value);
    await catchUpMessages(hallAfterId, fetchHallMessages, hall => { hallMessages.value = mergeMessages(hallMessages.value, hall); }, currentSession);
    if (!currentSession()) return;
    if (recipientId) {
      await reconcilePrivate(recipientId,currentSession);if(!currentSession())return;
      const current = privateRecords[recipientId] || [];
      const privateAfterId = lastMessageId(current);
      await catchUpMessages(privateAfterId, after => fetchPrivateMessages(recipientId, after), missed => {
        privateRecords[recipientId] = mergePrivate(privateRecords[recipientId] || [], missed);
      }, currentSession);
      if (!currentSession()) return;
    }
    const [users, unread] = await Promise.all([fetchOnlineUsers(), fetchPrivateUnread()]);
    if (!currentSession()) return;
    onlineUsers.value = Array.isArray(users) ? users : [];
    applyUnread(unread);
    await loadConversations(true);
  } catch (error) {
    if (currentSession()) showToast("消息补拉失败", error?.message || "可点击刷新页面后重试。");
  }
}

function startPing() {
  stopPing();
  pingTimer.value = window.setInterval(() => sendSocket("PING", {}, { silent: true }), 25000);
}

function stopPing() {
  clearInterval(pingTimer.value);
}

function sendSocket(type, payload, options = {}) {
  if (!socket.value?.send({ type, payload })) {
    if (!options.silent) {
      showToast("聊天连接中", "实时通道正在连接，请稍后再试。");
    }
    return false;
  }
  return true;
}

function handleSocketMessage(event) {
  const { type, payload } = event || {};
  if(type==='PRIVATE_MESSAGE_DELETED'){
    hidePrivateMessage(String(payload?.messageId),String(payload?.peerId));closeImageViewer();
    void loadConversations(true);const current=sessionGuard();void fetchPrivateUnread().then(items=>{if(current())applyUnread(items);}).catch(()=>{});return;
  }
  if(type==='STICKERS_INVALIDATED'){window.dispatchEvent(new Event('studyroom:stickers-invalidated'));return;}
  if (type === "CONNECTED" || type === "PONG") return;
  if (type === 'MEDIA_PUBLICATION_COMMITTED' && ['HALL', 'PRIVATE'].includes(payload?.kind)) {
    scheduleMediaRefresh(); return;
  }
  if (type === "ERROR") {
    if (payload?.clientMessageId) textOutbox.reject(payload.clientMessageId);
    if (payload?.code === "ACCOUNT_LOGGED_IN_ELSEWHERE") {
      window.dispatchEvent(new CustomEvent("studyroom:logged-in-elsewhere"));
      return;
    }
    showToast("发送失败", payload?.message || "聊天服务暂时不可用。");
    return;
  }
  if (type === "ONLINE_USERS_UPDATE") {
    onlineUsers.value = Array.isArray(payload) ? payload : [];
    onlineUsers.value.forEach((user) => {
      unreadMap[user.id] = user.unreadCount || 0;
    });
    return;
  }
  if (type === 'MESSAGE_ACK') {
    if (payload?.senderId !== authStore.user?.id) return;
    if (payload.channelType === 'HALL') appendHallMessage(payload);
    else if (payload.channelType === 'PRIVATE') appendPrivateMessage(payload);
    return;
  }
  if (type === "HALL_MESSAGE_RECEIVE") {
    appendHallMessage(payload);
    return;
  }
  if (type === "PRIVATE_MESSAGE_RECEIVE") {
    appendPrivateMessage(payload);
    return;
  }
  if (type === "PRIVATE_MESSAGE_RECALLED") {
    applyRecalledMessage(payload);
    return;
  }
  if (type === "PRIVATE_UNREAD_UPDATE") {
    applyUnread(payload);
  }
}

function appendHallMessage(message) {
  if (!message?.id) return;
  textOutbox.acknowledge(message);
  hallMessages.value = mergeMessages(hallMessages.value, [message]);
}

function appendPrivateMessage(message) {
  if (!message?.id) return;
  textOutbox.acknowledge(message);
  if(chatMemory.deletedIds.has(String(message.id)))return;
  const otherId = String(message.mine ? message.receiverId : message.senderId);
  if (!privateRecords[otherId]) privateRecords[otherId] = [];
  const existed = privateRecords[otherId].some((item) => String(item.id) === String(message.id));
  privateRecords[otherId] = mergePrivate(privateRecords[otherId], [message]);
  if (existed) return; // ACK + push + catch-up must not repeat unread/toast side effects.
  if (!message.mine) {
    unreadMap[otherId] = (unreadMap[otherId] || 0) + 1;
  }
  if (!displayUsers.value.some(user => String(user.id) === otherId)) void loadConversations(true);
}

function applyRecalledMessage(message) {
  if (!message?.id) return;
  const otherId = String(message.mine ? message.receiverId : message.senderId);
  const records = privateRecords[otherId];
  if (!records) return;
  const index = records.findIndex((item) => String(item.id) === String(message.id));
  if (index >= 0) {
    records.splice(index, 1, { ...records[index], ...message, recalled: true, canRecall: false });
  }
}

function applyUnread(items) {
  Object.keys(unreadMap).forEach((key) => {
    unreadMap[key] = 0;
  });
  (Array.isArray(items) ? items : []).forEach((item) => {
    unreadMap[item.senderId] = item.unreadCount || 0;
  });
}

async function openPrivate(user, navigate = true) {
  if (!user || String(user.id) === String(authStore.user?.id)) return;
  selectedUsers[user.id] = user;
  activeUserId.value = user.id;
  const current = sessionGuard();
  if (navigate) conversationOpen.value = true;
  try {
    await reconcilePrivate(user.id,current);if(!current())return;
    const messages = await fetchPrivateMessages(user.id);
    if (!current()) return;
    privateRecords[user.id] = mergePrivate(privateRecords[user.id] || [], messages);
    historyMore[`private:${user.id}`] = messages.length === 80;
  } catch (error) {
    if (current()) showToast("私聊加载失败", error?.message || "请稍后再试。");
  }
}

async function deleteActivePrivateHistory() {
  if (!activeUser.value) return;
  const recipientId = activeUser.value.id;
  const throughId=lastMessageId(privateRecords[recipientId]||[]);
  if(!throughId)return;
  const current = sessionGuard();
  if (!window.confirm("确认删除与该用户的聊天记录？这只会删除你这边可见的记录。")) {
    return;
  }
  try {
    await deletePrivateMessages(recipientId,throughId);
    if (!current()) return;
    for(const message of privateRecords[recipientId]||[])if(BigInt(message.id)<=BigInt(throughId))hidePrivateMessage(String(message.id),String(recipientId));
    delete chatMemory.anchors[`private:${recipientId}`];
    const unread=await fetchPrivateUnread().catch(()=>null);if(current() && unread)applyUnread(unread);
    showToast("聊天记录已删除", "对方仍可看到未删除的记录。");
  } catch (error) {
    if (current()) showToast("删除失败", error?.message || "请稍后重试。");
  }
}

async function recallMessage(message) {
  if (!message?.id || !message.canRecall) return;
  const current = sessionGuard();
  try {
    const recalled = await recallPrivateMessage(message.id);
    if (!current()) return;
    applyRecalledMessage(recalled);
    sendSocket("PRIVATE_MESSAGE_RECALL", { messageId: message.id }, { silent: true });
  } catch (error) {
    if (current()) showToast("撤回失败", error?.message || "只能撤回 3 分钟内的消息。");
  }
}

function sendHallText() {
  if (!canSend()) return;
  if (hallMedia.value.items.length) { void sendImages(hallTarget, hallDraft.value); return; }
  const content = hallDraft.value.trim();
  if (!content) return;
  if (enqueueText({ channelType: 'HALL' }, content)) {
    hallDraft.value = "";
  }
}

function sendPrivateText() {
  if (!activeUser.value || !canSend()) return;
  if (privateMedia.value.items.length) { void sendImages(privateTarget.value, privateDraft.value); return; }
  const content = privateDraft.value.trim();
  if (!content) return;
  if (enqueueText({ channelType: 'PRIVATE', receiverId: activeUser.value.id }, content)) {
    privateDraft.value = "";
  }
}

function dispatchText(frame) { return sendSocket(frame.type, frame.payload, { silent: true }); }
function enqueueText(target, content) {
  if (!reliableTextAvailable.value) { showToast('可靠发送暂不可用', '服务端未声明支持，草稿已保留。请检查连接或升级服务端。'); return false; }
  try { textOutbox.enqueue(authStore.user.id, target, content, dispatchText); return true; }
  catch (error) { showToast('无法发送', error.message); return false; }
}
function retryText(message) {
  if(message.stickerKey){if(canSend())void retrySticker(message.stickerKey);return;}
  if (!canSend() || !reliableTextAvailable.value) return;
  textOutbox.retry(message.clientMessageId, dispatchText);
}

function sendSticker(item,target){
  if(!canSend() || !stickerSession.enabled)return;
  const stamp=()=>authStore.user && !authStore.authTransition && !authStore.isBanned?{accountId:String(authStore.user.id),generation:authStore.sessionGeneration}:null;
  const session=stamp();if(!session)return;
  try{const id=createStickerSend(new MediaApi(session,stamp),authStore.user.id,target.kind==='hall'?'HALL':'PRIVATE',target.kind==='private'?String(target.recipientId):null,item);void retrySticker(id);}
  catch(error){showToast('表情发送失败',error?.message);}
}
async function retrySticker(id){
  const current=sessionGuard();
  try{const command=await submitSticker(id);if(current() && command)await refreshMediaTarget(command.kind==='HALL'?hallTarget:{kind:'private',recipientId:String(command.recipient)});}
  catch(error){if(current())showToast('表情结果待处理',error?.message || '请手动重试原消息');}
}
function favoriteMessage(message){try{stickers.add(undefined,String(message.id));showToast('收藏任务已建立','可打开“表情 → 我的收藏”查看结果。');}catch(error){showToast('收藏失败',error?.message);}}

function canSend() {
  if (!authStore.user || authStore.isBanned || authStore.authTransition) return false;
  if (isMuted.value) {
    showToast("当前处于禁言状态", "禁言用户暂时无法在聊天页发言。");
    return false;
  }
  return true;
}

function mediaAction(target, action, value) {
  if (!canSend()) return;
  try { media.get(target)[action](value); } catch (error) { showToast('图片任务未完成', error.message); }
}
function discardMedia(target) {
  if (window.confirm('清除本地图片任务？已提交内容可能已发送；清除不会撤回，请先查看聊天记录。')) media.reset(target);
}
async function sendImages(target, content) {
  if (!canSend()) return;
  const current = sessionGuard(), generation = authStore.sessionGeneration, frozenTarget = Object.freeze({ ...target });
  try {
    const task = media.get(frozenTarget);
    if (task.snapshot().state === 'sending') return;
    await task.submit(content, null);
    if (generation !== authStore.sessionGeneration || media.find(frozenTarget) !== task) return;
    media.reset(frozenTarget);
    if (frozenTarget.kind === 'hall') {
      if (hallDraft.value === content) hallDraft.value = '';
    } else {
      if (privateDrafts[frozenTarget.recipientId] === content) privateDrafts[frozenTarget.recipientId] = '';
    }
    if (current()) await refreshMediaTarget(frozenTarget);
  } catch (error) {
    if (current()) showToast('图片任务待处理', media.snapshot(frozenTarget).state === 'unknown' ? '结果待确认，请回到原会话点击“查询并重试”，不要重新发送。' : error?.message || '发送失败');
  }
}
async function refreshMediaTarget(target) {
  const current = sessionGuard();
  try {
    const messages = target.kind === 'hall' ? await fetchHallMessages() : await fetchPrivateMessages(String(target.recipientId));
    if (!current()) return;
    if (target.kind === 'hall') hallMessages.value = mergeMessages(hallMessages.value, messages);
    else privateRecords[target.recipientId] = mergePrivate(privateRecords[target.recipientId] || [], messages);
  } catch { if (current()) showToast('发布结果已确认或有新消息', '列表同步失败，请重新打开会话或刷新；不要重复发送。'); }
}
let mediaRefreshTimer = 0;
let mediaRefreshRunning = false;
let mediaRefreshAgain = false;
function scheduleMediaRefresh() {
  if (disposed) return;
  if (mediaRefreshRunning) { mediaRefreshAgain = true; return; }
  if (mediaRefreshTimer) return;
  mediaRefreshTimer = window.setTimeout(async () => {
    mediaRefreshTimer = 0; mediaRefreshRunning = true;
    try { await recoverMissedMessages(); } finally {
      mediaRefreshRunning = false;
      if (mediaRefreshAgain) { mediaRefreshAgain = false; scheduleMediaRefresh(); }
    }
  }, 150);
}

function showToast(title, text, userId = null) {
  toast.title = title;
  toast.text = text || "";
  toast.userId = userId;
  toast.show = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.show = false;
  }, userId ? 7000 : 3600);
}

function openToastPrivate() {
  const user = displayUsers.value.find((item) => String(item.id) === String(toast.userId));
  toast.show = false;
  if (user) openPrivate(user);
}

function scrollToBottom(element) {
  element?.scrollToBottom?.();
}

function openImageViewer(images, index = 0) {
  imageViewer.images = [...(images || [])].filter(Boolean);
  imageViewer.index = Math.min(Math.max(index, 0), Math.max(imageViewer.images.length - 1, 0));
  imageViewer.open = imageViewer.images.length > 0;
}

function closeImageViewer() {
  imageViewer.open = false;
}

async function openNotificationTarget() {
  if (route.query.unread === '1') { activeUserId.value = null; conversationOpen.value = false; return; }
  const peer = route.query.peer;
  if (!entityId(peer) || peer === String(authStore.user?.id)) return;
  const user = displayUsers.value.find(item => String(item.id) === peer) || { id: peer, username: '私信会话' };
  await openPrivate(user);
}
watch(() => [route.query.peer, route.query.unread], () => { if (!disposed) void openNotificationTarget(); });
onMounted(async () => {
  window.addEventListener('resize', syncConversationWidth);
  const current = sessionGuard();
  await loadInitialData();
  if (!current()) return;
  updateChatStatus("IDLE").catch(() => {});
  connectSocket();
  await openNotificationTarget();
  void stickers.refresh();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncConversationWidth);
  messageNotices.activePeer = null;
  closeMotionDialog(deletionDialog.value, true);deletionTarget.value=null;
  disposed = true;
  clearTimeout(mediaRefreshTimer);
  clearTimeout(toastTimer);
  stopPing();
  socket.value?.close();
});
</script>

<style scoped>
.message-delete-dialog{width:min(440px,calc(100vw - 40px));box-sizing:border-box;padding:24px;border:1px solid var(--sr-color-line-strong);border-radius:22px;background:var(--sr-color-surface-solid);color:var(--sr-color-text)}.message-delete-dialog::backdrop{background:#0008}.message-delete-dialog h2{font-size:20px;margin-top:0}.message-delete-dialog p{line-height:1.65;overflow-wrap:anywhere}.message-delete-dialog>div{display:flex;justify-content:flex-end;gap:12px}.message-delete-dialog button{min-height:44px;padding:8px 18px;border:1px solid var(--sr-color-line-strong);border-radius:12px;color:inherit;background:#ffffff12;cursor:pointer}.message-delete-dialog [role=alert]{color:#ffd8ae}
.chat-page{position:relative;width:100%;height:100dvh;overflow:hidden;background:var(--sr-color-canvas);color:var(--sr-color-text);font-family:var(--sr-font-sans)}
.chat-frame{height:100%}.chat-bg{position:absolute;inset:0;background-size:cover;background-position:center}.chat-bg::after{content:"";position:absolute;inset:0;background:rgba(8,11,17,.36)}
.topbar{position:fixed;top:30px;right:46px;z-index:8}.nav-tabs{display:flex;gap:4px;padding:6px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:var(--sr-color-surface)}.nav-item{min-height:44px;padding:0 14px;border:0;border-radius:var(--sr-radius-control);background:transparent;color:inherit;font-size:14px;cursor:pointer}.nav-item.active{background:var(--sr-color-selected)}
.chat-shell{position:absolute;inset:112px 0 90px;display:grid;grid-template-columns:280px minmax(0,1fr);width:min(1200px,calc(100% - 32px));margin-inline:auto;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-panel);overflow:hidden}
.desktop-shell .chat-shell{inset:16px 0}
.glass{min-height:0;min-width:0;background:var(--sr-color-surface-solid);overflow:hidden}.conversation-list{display:flex;flex-direction:column;border-right:1px solid var(--sr-color-line);background:var(--sr-color-surface)}
.conversation-scroll{overflow:auto;flex:1;min-height:0;padding:8px;scrollbar-width:thin;scrollbar-color:rgba(180,201,185,.3) transparent}
.conversation-row{display:block;width:100%;min-height:72px;padding:14px 12px;text-align:left;border:1px solid transparent;border-radius:var(--sr-radius-control);background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background-color var(--sr-motion-fast) ease}
.conversation-row.active{background:var(--sr-color-selected);border-color:var(--sr-color-line)}.conversation-row strong{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:600}.conversation-row small{display:block;margin-top:6px;color:var(--sr-color-text-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.conversation-unread{font-size:11px;background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-radius:20px;min-width:22px;padding:2px 5px;text-align:center;font-variant-numeric:tabular-nums}.conversation-error{color:#f7bab4;font-size:13px;padding:12px;line-height:1.6}
.hall-panel,.dm-panel{display:flex;flex-direction:column}.panel-head{flex:none;min-height:72px;display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--sr-color-line)}.panel-head>div{min-width:0;flex:1}.panel-head h2,.panel-head h3{margin:0;font-size:18px;font-weight:650;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.eyebrow{display:none}
.badge{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:20px;background:rgba(255,255,255,.04);color:var(--sr-color-text-muted);font-size:12px;white-space:nowrap}.socket-badge.open{color:#b9dec5;background:rgba(107,166,128,.12)}
.history-delete-btn,.back-to-list{min-height:44px;padding:0 12px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:transparent;color:var(--sr-color-text-muted);font:500 12px var(--sr-font-sans);cursor:pointer}.back-to-list{display:none}
.restriction-note{margin:12px 16px 0;padding:12px 14px;border-radius:var(--sr-radius-control);color:#e8d3ae;background:rgba(197,155,93,.13);border:1px solid rgba(197,155,93,.25);font-size:13px;line-height:1.6}.dm-empty,.empty-note{padding:26px;color:var(--sr-color-text-muted);text-align:center;font-size:13px;line-height:1.8}
.toast{position:fixed;right:24px;bottom:100px;z-index:var(--sr-layer-toast);width:min(360px,calc(100vw - 48px));padding:18px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-panel);background:var(--sr-color-surface-solid);box-shadow:0 20px 60px #0004;opacity:0;pointer-events:none;transform:translateY(8px);transition:opacity 180ms ease,transform 180ms var(--sr-ease-out)}.toast.show{opacity:1;transform:none;pointer-events:auto}.toast strong{display:block;margin-bottom:6px}.toast p{margin:0;color:var(--sr-color-text-muted);font-size:13px;line-height:1.6}.send-btn{min-height:44px;margin-top:12px;border:0;border-radius:var(--sr-radius-control);padding:0 16px;background:var(--sr-color-accent);color:var(--sr-color-accent-ink);cursor:pointer}
button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:-3px}
@media(hover:hover) and (pointer:fine){.conversation-row:not(.active):hover,.history-delete-btn:hover,.back-to-list:hover{background:rgba(255,255,255,.04)}}
@media(max-width:800px){.chat-shell,.desktop-shell .chat-shell{inset:8px;width:calc(100% - 16px);grid-template-columns:minmax(0,1fr);border-radius:16px}.conversation-list{border:0}.active-conversation{display:none}.conversation-open .conversation-list{display:none}.conversation-open .active-conversation{display:flex}.back-to-list{display:block}.panel-head{padding:10px 12px;gap:8px;min-height:64px;flex-wrap:wrap}.panel-head h2,.panel-head h3{font-size:17px}.topbar{right:12px;left:12px;overflow:auto}.nav-tabs{width:max-content}.nav-item{padding:10px}}
@media(prefers-reduced-motion:reduce){.toast{transition:none;transform:none}}
.sr-reduced-motion .toast{transition:none;transform:none}
@media(prefers-reduced-transparency:reduce){.glass{background:var(--sr-color-surface-solid)}}
.sr-reduced-transparency .glass{background:var(--sr-color-surface-solid)}
.conversation-list .panel-head{justify-content:space-between}
.conversation-scroll{padding:6px;overscroll-behavior:contain}
.conversation-row{display:flex;align-items:center;gap:12px;min-height:76px;padding:12px 10px;border-radius:12px}
.conversation-copy{flex:1;min-width:0}
.conversation-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.conversation-row small{margin-top:5px;line-height:1.4}
.conversation-meta{align-self:stretch;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:8px;padding:2px 0}
.conversation-meta time{font-size:11px;font-variant-numeric:tabular-nums;color:var(--sr-color-text-muted);white-space:nowrap}
.conversation-unread{min-width:18px;font-size:10px}
.refresh-conversations{display:grid;place-items:center;width:36px;padding:0;border:0}
.refresh-conversations:disabled{opacity:.45;cursor:wait}
.active-conversation>.panel-head{min-height:64px;padding-block:10px}
.active-conversation>.panel-head h2,.active-conversation>.panel-head h3{font-size:16px;font-weight:550}
.active-conversation{background:rgba(21,28,29,.34)}
@media(max-width:800px){.conversation-row{min-height:80px}.active-conversation>.panel-head{gap:8px}.conversation-row strong{font-size:15px}}
@media(prefers-reduced-motion:reduce){.conversation-row{transition:none}}
.sr-reduced-motion .conversation-row{transition:none}
</style>
