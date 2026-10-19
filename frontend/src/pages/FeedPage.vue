<template>
  <main class="feed-page" :style="feedFrameStyle">
    <div class="feed-bg" :style="backgroundStyle"></div>
    <div class="feed-shade"></div>

    <header class="topbar">
      <nav class="nav-tabs" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: item.key === 'feed' }"
          type="button"
          @click="handleNav(item)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>

    <section class="feed-shell" data-motion-group>
      <dialog ref="composerDialog" class="publisher-dialog sr-glass sr-glass--floating" aria-label="发布动态" @close="composerOpen = false">
      <header class="publisher-heading"><strong>记录这一刻</strong><button type="button" @click="closeComposer">关闭并保留草稿</button></header>
      <FeedComposer
        :name="currentUserName"
        :avatar="currentUserAvatar"
        :content="draft.content"
        :scene-code="draft.sceneCode"
        :themes="themeOptions"
        :previews="imagePreviews"
        :media-enabled="media.enabled"
        :locked="mediaState.locked || feedSession.textUnknown"
        :publication-state="feedSession.textUnknown ? 'unknown' : mediaState.state"
        :muted="isMuted"
        :publishing="publishing"
        :processing-images="processingImages"
        :can-publish="canPublish"
        :error="composerError"
        :asset-url="assetUrl"
        :avatar-text="avatarText"
        :theme-thumb-style="themeThumbStyle"
        @update:content="draft.content = $event"
        @insert-text="insertText"
        @select-theme="selectTheme"
        @add-files="addFiles"
        @remove-image="removeImage"
        @retry-image="id => mediaAction('retry', id)"
        @cancel-image="id => mediaAction('cancel', id)"
        @reorder-images="ids => mediaAction('reorder', ids)"
        @discard-images="discardImages"
        @publish="publishPost"
      />
      </dialog>

      <section ref="timelineElement" class="feed-list glass sr-glass sr-glass--reading" @scroll.passive="rememberPosition">
        <div class="section-head">
          <div>
            <p class="eyebrow">TIMELINE</p>
            <h2>片刻社区</h2>
          </div>
          <button class="soft-chip" type="button" @click="openComposer">写动态</button>
          <button class="soft-chip" type="button" :disabled="loadingPosts" @click="loadPosts(true)">
            {{ loadingPosts ? "同步中" : "刷新" }}
          </button>
        </div>
        <nav class="stream-tabs sr-glass" aria-label="动态信息流">
          <button type="button" :class="{ 'sr-glass-control': feedSession.stream === 'square' }" :aria-pressed="feedSession.stream === 'square'" @click="switchStream('square')">广场</button>
          <button type="button" :class="{ 'sr-glass-control': feedSession.stream === 'following' }" :aria-pressed="feedSession.stream === 'following'" :disabled="!dualFeed" @click="switchStream('following')">关注</button>
        </nav>
        <p v-if="capabilityError" class="error-text" role="status">{{ capabilityError }} <button type="button" @click="loadCapabilities">重新检查</button></p>
        <button v-if="pageState.stale" class="new-content" type="button" @click="loadPosts(true)">有新内容或关系变化，点击更新</button>
        <details class="activity-notices"><summary>互动通知 · {{ currentUserNotifications.length }}</summary>
          <p v-if="notificationError" role="status">{{ notificationError }} <button type="button" @click="loadNotifications">重试</button></p>
          <button v-for="notice in currentUserNotifications" :key="notice.key" type="button" @click="openNotice(notice)">{{ notice.text }}</button>
          <p v-if="!currentUserNotifications.length && !notificationError">暂无互动通知</p>
        </details>

        <div v-if="loadingPosts && !posts.length" class="empty-state">正在同步动态...</div>
        <p v-if="feedError && posts.length" class="error-text" role="alert">{{ feedError }} 请点击刷新同步列表，不要重复发布。</p>
        <div v-else-if="feedError && !posts.length" class="empty-state">
          {{ feedError }}
          <button class="soft-chip" type="button" @click="loadPosts">重试</button>
        </div>
        <div v-else-if="!posts.length" class="empty-state">{{ feedSession.stream === 'following' ? '这里还没有动态。先在广场关注感兴趣的人。' : '还没有动态，先分享第一条吧。' }}</div>

        <article v-for="post in posts" :key="post.id" class="post-card" :data-post-id="post.id">
          <div class="post-head">
            <div class="avatar small">
              <img v-if="post.authorAvatar" :src="assetUrl(post.authorAvatar)" alt="头像" loading="lazy" decoding="async" />
              <span v-else>{{ avatarText(post.authorName) }}</span>
            </div>
            <div>
              <strong>{{ post.authorName }}</strong>
              <span>{{ post.studyRoomId }} · {{ post.createdAt }}</span>
            </div>
            <em>{{ post.sceneName }}</em>
            <button v-if="dualFeed && !isOwnPost(post)" class="follow-button" type="button" :disabled="followBusy[post.authorId]" @click="toggleFollow(post.authorId)">{{ feedSession.following[post.authorId] ? '已关注' : '关注' }}</button>
          </div>

          <p v-if="post.content" class="post-content">{{ post.content }}</p>

          <MediaGrid :urls="post.imageUrls || []" :media="post.media" label="动态图片" @open="openImageViewer" />

          <div class="post-actions">
            <button type="button" :disabled="likeBusy[post.id]" :class="{ active: post.liked }" @click="toggleLike(post)">
              {{ post.liked ? "已喜欢" : "喜欢" }} · {{ post.likeCount || 0 }}
            </button>
            <button type="button" @click="toggleComments(post)">
              评论 · {{ post.commentCount || 0 }}
            </button>
            <button v-if="isOwnPost(post)" class="danger-action" type="button" @click="openDeleteConfirm(post)">删除</button>
          </div>

          <Transition name="comments">
            <section v-if="expandedPostId === post.id" class="comments-panel">
              <div v-if="commentsLoading[post.id]" class="comment-empty">正在载入评论...</div>
              <div v-else-if="!(comments[post.id] || []).length" class="comment-empty">暂无评论。</div>
              <article
                v-for="comment in comments[post.id]"
                :key="comment.id"
                class="comment-row"
                role="button"
                tabindex="0"
                @click="startReply(post, comment)"
                @keydown.enter.prevent="startReply(post, comment)"
                @keydown.space.prevent="startReply(post, comment)"
                :aria-label="`回复 ${comment.authorName} 的评论`"
              >
                <span>{{ avatarText(comment.authorName) }}</span>
                <div>
                  <strong>
                    {{ comment.authorName }}
                    <template v-if="comment.replyToName"> 回复 {{ comment.replyToName }}</template>
                  </strong>
                  <p>{{ comment.content }}</p>
                  <small>{{ comment.createdAt }} · 回复</small>
                </div>
              </article>
              <form class="comment-form" @submit.prevent="submitComment(post)">
                <div v-if="commentReplyTargets[post.id]" class="reply-target">
                  <span>正在回复 {{ commentReplyTargets[post.id].authorName }}</span>
                  <button type="button" @click="clearReply(post.id)">取消</button>
                </div>
                <input
                  v-model.trim="commentDrafts[post.id]"
                  :readonly="Boolean(createTasks[`comment:${post.id}`])"
                  :disabled="isMuted"
                  maxlength="300"
                  :aria-label="commentReplyTargets[post.id] ? `回复 ${commentReplyTargets[post.id].authorName}` : '评论内容'"
                  :placeholder="commentReplyTargets[post.id] ? `回复 ${commentReplyTargets[post.id].authorName}` : '写一条评论'"
                />
                <button type="submit" :disabled="isMuted || commentBusy[post.id] || createTasks[`comment:${post.id}`]?.busy">{{ createTasks[`comment:${post.id}`]?.unknown ? '核对并重试' : '发送' }}</button>
              </form>
            </section>
          </Transition>
        </article>
        <button v-if="posts.length && hasMorePosts" class="soft-chip load-more" type="button" :disabled="loadingPosts || (feedSession.stream === 'following' && pageState.stale)" @click="loadMorePosts">
          {{ loadingPosts ? "载入中" : "加载更多" }}
        </button>
      </section>

    </section>

      <dialog ref="deleteDialog" class="confirm-modal glass delete-dialog sr-glass sr-glass--floating" aria-label="删除动态" @close="deleteTarget = null">
          <div class="confirm-mark">!</div>
          <p class="eyebrow">CONFIRM</p>
          <h2>删除动态</h2>
          <p>确认删除这条动态吗？删除后将不会再出现在动态广场和个人主页。</p>
          <div class="modal-actions">
            <button type="button" @click="closeMotionDialog(deleteDialog)">取消</button>
            <button class="confirm-danger" type="button" :disabled="deleting" @click="removePost">{{ deleting ? '删除中…' : '确认删除' }}</button>
          </div>
      </dialog>

    <Transition name="modal-fade">
      <ImageViewer v-if="imageViewer.open" :images="imageViewer.images.map(assetUrl)" :initial-index="imageViewer.index" @close="closeImageViewer" />
    </Transition>
  </main>
</template>

<script setup>
import { openMotionDialog, closeMotionDialog } from '../motion/runtime';
import { sameEntityId } from '@studyroom/contracts';
import { createTasks } from '../services/reliableCreate';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from "vue";
import { useRouter } from "vue-router";
import { cloudMediaUrl as assetUrl } from "../utils/cloudMedia";
import ImageViewer from "../components/media/ImageViewer.vue";
import MediaGrid from "../components/media/MediaGrid.vue";
import FeedComposer from "./feed/FeedComposer.vue";
import { feedSession, mergeFeedEntities, removeFeedEntity, touchFeedEntity } from '../feed/session';
import { sceneAssetCatalog } from "../scenes/sceneAssetCatalog";
import {
  createFeedPost,
  createPostComment,
  createNotificationSocket,
  deleteFeedPost,
  fetchFeedNotifications,
  fetchFeedPosts,
  fetchFeedPost,
  fetchFeedPage, fetchFeedCapabilities, setFeedFollow, findFeedPublication,
  fetchPostComments,
  likePost,
  unlikePost
} from "../services/feed";
import { useAuthStore } from "../stores/auth";
import { useMediaDrafts } from "../media/useMediaDrafts";
import { createChatSocket } from "../services/chat";
import { FeedNotificationSync } from '../feed/notificationSync';
import {FeedPostSync} from '../feed/postSync';

const router = useRouter();
const authStore = useAuthStore();
const media = useMediaDrafts();
const mediaTarget = Object.freeze({ kind: 'feed' });
const mediaState = computed(() => media.snapshot(mediaTarget));
let disposed = false;
function sessionGuard() { const generation = authStore.sessionGeneration, owner = authStore.user?.id; return () => !disposed && generation === authStore.sessionGeneration && owner === authStore.user?.id; }

const pageState = computed(() => feedSession.pages[feedSession.stream]);
const posts = computed(() => pageState.value.ids.map(id => feedSession.entities[id]).filter(Boolean));
const dualFeed = ref(false), capabilityError = ref('');
const composerDialog = ref(null), composerOpen = ref(false), deleteDialog = ref(null), deleting = ref(false), timelineElement = ref(null);
const followBusy = reactive({}), likeBusy = reactive({}), commentBusy = reactive({});
const feedNotifications = ref([]);
const loadingPosts = computed(() => pageState.value.loading);
const publishing = toRef(feedSession, 'publishing');
const composerError = toRef(feedSession, 'error');
const feedError = computed({ get: () => pageState.value.error, set: value => { pageState.value.error = value; } });
const notificationError = ref("");
const hasMorePosts = computed(() => pageState.value.more && !pageState.value.stale);
const imagePreviews = computed(() => mediaState.value.items);
const processingImages = computed(() => imagePreviews.value.some(item => ['queued','processing','uploading'].includes(item.status)));
const expandedPostId = ref(null);
const deleteTarget = ref(null);
const recommendedSeed = ref(Date.now());
const comments = feedSession.comments;
const commentsLoading = reactive({});
const commentDrafts = feedSession.commentDrafts;
const commentReplyTargets = feedSession.replyTargets;
const notificationSocket = ref(null);
let notificationHeartbeat = 0;
const noticeSessionCurrent = sessionGuard();
const postSync=new FeedPostSync({
  known:id=>posts.value.some(post=>String(post.id)===id),
  busy:id=>Boolean(likeBusy[id]||commentBusy[id]||commentsLoading[id]||loadingPosts.value),
  revision:id=>feedSession.entityRevision[id]||0,
  fetch:async id=>{const post=await fetchFeedPost(id);return {post,comments:post&&String(expandedPostId.value)===id?await fetchPostComments(id):undefined};},
  apply:(id,result)=>{if(!noticeSessionCurrent())return;if(!result.post){const post=feedSession.entities[id];if(post)removeFeedEntity(post.id);return;}
    mergeFeedEntities([{id:result.post.id,liked:result.post.liked,likeCount:result.post.likeCount,commentCount:result.post.commentCount}]);
    if(result.comments&&String(expandedPostId.value)===id)comments[id]=result.comments;
  },error:()=>{if(noticeSessionCurrent())notificationError.value='互动数据同步暂时失败，重新连接或返回此页时会刷新。';}
});
const notificationSync = new FeedNotificationSync({ fetch: fetchFeedNotifications,
  update: items => { if (noticeSessionCurrent()) feedNotifications.value = items; },
  error: message => { if (noticeSessionCurrent()) notificationError.value = message; }
});
watch(() => [authStore.user?.id, authStore.sessionGeneration, authStore.authTransition, authStore.isBanned], () => {
  if (!noticeSessionCurrent() || authStore.authTransition || authStore.isBanned) { stopNotificationSocket(); feedNotifications.value = []; notificationError.value = ''; }
}, { flush: 'sync' });
let mediaSocket = null, mediaRefreshTimer = 0;
const imageViewer = reactive({
  open: false,
  images: [],
  index: 0
});

const draft = feedSession.draft;

const recommendationPool = [
  { key: "mountain", name: "高山湖泊", mood: "安静" },
  { key: "beach", name: "海边沙滩", mood: "通透" },
  { key: "forest", name: "森林", mood: "恢复" },
  { key: "library", name: "图书馆", mood: "秩序" },
  { key: "cafe", name: "雨天咖啡馆", mood: "温暖" },
  { key: "snow", name: "雪山窗边", mood: "清醒" }
];

const mountainAfternoon = sceneAssetCatalog.mountain.afternoon.large.webp;
const beachAfternoon = sceneAssetCatalog.beach.afternoon.large.webp;
const forestAfternoon = sceneAssetCatalog.forest.afternoon.large.webp;
const libraryAfternoon = sceneAssetCatalog.library.afternoon.large.webp;
const cafeAfternoon = sceneAssetCatalog.cafe.afternoon.large.webp;
const snowAfternoon = sceneAssetCatalog.snow.afternoon.large.webp;

const themeOptions = computed(() => [
  { key: "default", name: "默认", image: "" },
  { key: "mountain", name: "高山湖泊", image: mountainAfternoon },
  { key: "beach", name: "海边沙滩", image: beachAfternoon },
  { key: "forest", name: "森林", image: forestAfternoon },
  { key: "library", name: "图书馆", image: libraryAfternoon },
  { key: "cafe", name: "雨天咖啡馆", image: cafeAfternoon },
  { key: "snow", name: "雪山窗边", image: snowAfternoon }
]);

const recommendedScenes = computed(() => shuffledScenes(recommendedSeed.value).slice(0, 3));

const hotTopics = computed(() => {
  const counts = new Map();
  posts.value.forEach((post) => {
    const matches = String(post.content || "").match(/#[^\s#]+/g) || [];
    matches.forEach((topic) => counts.set(topic, (counts.get(topic) || 0) + 1));
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
});

const currentUserNotifications = computed(() =>
  feedNotifications.value.map((notice) => {
    const actor = notice.actorName || "StudyRoom";
    const text = notice.type === "reply"
      ? `${actor} 回复了你的评论。`
      : notice.type === "comment"
        ? `${actor} 评论了你的动态。`
        : `${actor} 点赞了你的动态。`;
    return {
      key: notice.key || `${notice.type}-${notice.postId}-${notice.actorId}-${notice.createdAt}`,
      postId: notice.postId,
      text
    };
  })
);

const navItems = computed(() => [
  { key: "scene", label: "场景", route: "scene" },
  { key: "focus", label: "专注", route: "focus" },
  { key: "entertainment", label: "娱乐", route: "entertainment" },
  { key: "chat", label: "聊天", route: "chat" },
  { key: "feed", label: "动态", route: "feed" },
  ...(authStore.isAdmin ? [{ key: "admin", label: "管理", route: "admin" }] : []),
  { key: "profile", label: "我的", route: "profile" }
]);

const selectedTheme = computed(() => themeOptions.value.find((theme) => theme.key === draft.sceneCode) || themeOptions.value[0]);
const backgroundStyle = computed(() => {
  const image = selectedTheme.value?.image || forestAfternoon;
  return { backgroundImage: `url(${image})` };
});
const currentUserName = computed(() => authStore.user?.nickname || authStore.user?.username || "StudyRoom");
const currentUserAvatar = computed(() => authStore.user?.avatarUrl || "");
const isMuted = computed(() => authStore.userRole === "MUTED");
const canPublish = computed(() => feedSession.textUnknown || mediaState.value.state === 'unknown' || (mediaState.value.state === 'editing' &&
  (imagePreviews.value.length ? imagePreviews.value.every(item => item.status === 'ready') : Boolean(draft.content.trim()))));
const feedFrameStyle = computed(() => ({
  "--feed-nav-top": "30px",
  "--feed-nav-right": "46px",
  "--feed-shell-top": "112px"
}));

function handleNav(item) {
  if (item.route !== "feed") {
    router.push({ name: item.route });
  }
}

function avatarText(name) {
  return String(name || "S").trim().slice(0, 1).toUpperCase();
}

function isOwnPost(post) {
  return sameEntityId(post.authorId, authStore.user?.id);
}

function selectTheme(key) {
  if (publishing.value || mediaState.value.locked || feedSession.textUnknown) return;
  draft.sceneCode = key;
}

function shuffledScenes(seed) {
  return recommendationPool
    .map((scene, index) => {
      const score = Math.sin(seed + index * 999) * 10000;
      return { scene, score: score - Math.floor(score) };
    })
    .sort((a, b) => a.score - b.score)
    .map((item) => item.scene);
}

async function openNotice(notice) {
  if (!notice?.postId) return;
  const post = posts.value.find((item) => String(item.id) === String(notice.postId));
  if (post && Number(post.commentCount || 0) > 0 && expandedPostId.value !== post.id) {
    await toggleComments(post);
  }
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-post-id="${notice.postId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function openImageViewer(images, index = 0) {
  imageViewer.images = [...(images || [])];
  imageViewer.index = Math.min(Math.max(index, 0), Math.max(imageViewer.images.length - 1, 0));
  imageViewer.open = imageViewer.images.length > 0;
}

function closeImageViewer() {
  imageViewer.open = false;
}

function themeThumbStyle(theme) {
  if (!theme.image) {
    return {
      background: "linear-gradient(135deg, rgba(255,255,255,.2), rgba(255,255,255,.05))"
    };
  }
  return { backgroundImage: `url(${theme.image})` };
}

function insertText(text) {
  if (isMuted.value || publishing.value || mediaState.value.locked || feedSession.textUnknown) return;
  draft.content = `${draft.content}${text}`.slice(0,500);
}

function rememberPosition() {
  const box=timelineElement.value;if(!box || disposed)return;
  const top=box.getBoundingClientRect().top,first=[...box.querySelectorAll('[data-post-id]')].find(node=>node.getBoundingClientRect().bottom>top);
  pageState.value.anchor={id:String(first?.dataset.postId || ''),offset:first?first.getBoundingClientRect().top-top:0,top:box.scrollTop};
}
async function restorePosition() {
  await nextTick();const box=timelineElement.value,anchor=pageState.value.anchor;if(!box || disposed)return;
  if(!anchor){box.scrollTop=0;return;}const row=box.querySelector(`[data-post-id="${anchor.id}"]`);
  box.scrollTop=row?box.scrollTop+row.getBoundingClientRect().top-box.getBoundingClientRect().top-anchor.offset:anchor.top;
}
async function switchStream(stream) {
  if(stream===feedSession.stream || stream==='following' && !dualFeed.value)return;
  rememberPosition();feedSession.stream=stream;
  if(!pageState.value.loaded || pageState.value.stale)await loadPosts(true);else await restorePosition();
}
async function openComposer(){composerOpen.value=true;await nextTick();openMotionDialog(composerDialog.value);}
function closeComposer(){closeMotionDialog(composerDialog.value);}
async function loadCapabilities(){const current=sessionGuard();try{const value=await fetchFeedCapabilities();if(!current())return;dualFeed.value=value?.dualFeed===true;capabilityError.value=dualFeed.value?'':'当前服务尚未开放关注流，广场仍可使用。';}catch{if(current())capabilityError.value='无法确认关注功能是否可用，暂时禁用。';}}

async function loadPosts(reset = true, preservePosition = false) {
  const activeSession=sessionGuard(),stream=feedSession.stream,state=feedSession.pages[stream],epoch=feedSession.relationEpoch,request=++state.request;
  const revisions={...feedSession.entityRevision};
  const current=()=>activeSession() && request===state.request && (stream!=='following' || epoch===feedSession.relationEpoch);
  state.loading=true;state.error='';
  if(reset){state.cursor=null;state.stale=true;}
  try {
    const modern=dualFeed.value;
    const result=modern?await fetchFeedPage(stream,reset?null:state.cursor):{items:await fetchFeedPosts(reset?null:state.ids.at(-1))};
    if (!current()) return;
    if(!Array.isArray(result?.items))throw new Error('动态响应无效。');
    mergeFeedEntities(result.items,revisions);state.ids=[...new Set([...(reset?[]:state.ids),...result.items.map(post=>post.id)])].filter(id=>!feedSession.removed.has(id));
    state.cursor=result.nextCursor||null;state.more=modern?!!result.nextCursor:result.items.length===30;state.loaded=true;state.stale=false;
    if(modern && result.relationshipVersion>=feedSession.relationshipVersion){feedSession.relationshipVersion=result.relationshipVersion;for(const post of result.items)feedSession.following[post.authorId]=(result.followingIds||[]).includes(post.authorId);}
    recommendedSeed.value = Date.now();
    if(reset){if(!preservePosition)state.anchor=null;if(stream===feedSession.stream)await restorePosition();void loadNotifications();}
  } catch (error) {
    if (current()) state.error=error?.message || "动态加载失败，请稍后重试。";
  } finally {
    if (activeSession() && request===state.request)state.loading=false;
  }
}

function invalidateRelationships(){feedSession.relationEpoch++;const state=feedSession.pages.following;state.request++;state.loading=false;state.stale=true;state.cursor=null;}
async function toggleFollow(id){if(followBusy[id])return;const current=sessionGuard();followBusy[id]=true;try{const result=await setFeedFollow(id,!feedSession.following[id]);if(!current())return;if(result.version>=feedSession.relationshipVersion){feedSession.following[id]=result.following;feedSession.relationshipVersion=result.version;}invalidateRelationships();if(feedSession.stream==='following')await loadPosts(true);}catch(error){if(current())feedError.value=error.message || '关注修改未确认，请刷新后重试。';}finally{if(current())followBusy[id]=false;}}

async function loadNotifications() {
  await notificationSync.refresh();
}

function loadMorePosts() {
  if(pageState.value.stale)return loadPosts(true);
  return loadPosts(false);
}

function mergeNotification(notice) {
  notificationSync.receive(notice);
}

function connectNotificationSocket() {
  if (!noticeSessionCurrent() || !authStore.isLoggedIn || authStore.authTransition || authStore.isBanned || document.visibilityState !== 'visible' || notificationSocket.value) return;
  const current = sessionGuard();
  notificationSync.start();
  postSync.start();
  void loadNotifications();
  notificationSocket.value = createNotificationSocket({
    async onOpen() {
      if (!current()) return;
      await loadNotifications();
      if(current())posts.value.slice(0,30).forEach(post=>postSync.invalidate(String(post.id)));
    },
    onMessage(message) {
      if (!current()) return;
      if (message?.type === "FEED_NOTIFICATION_RECEIVE") {
        mergeNotification(message.payload || {});
        postSync.invalidate(String(message.payload?.postId||''));
      } else if(message?.type==='FEED_POST_CHANGED'){
        postSync.invalidate(message.payload?.postId);
      } else if (message?.type === 'ERROR') {
        if (['AUTH_REQUIRED','AUTH_SESSION_EXPIRED','ACCOUNT_LOGGED_IN_ELSEWHERE','AUTH_ACCOUNT_BANNED'].includes(message.payload?.code)) {
          stopNotificationSocket();
          window.dispatchEvent(new Event(message.payload.code === 'AUTH_ACCOUNT_BANNED' ? 'studyroom:account-banned' : 'studyroom:session-ended'));
        } else notificationError.value = '互动通知连接异常，请重试。';
      }
    }
  });
  notificationHeartbeat = window.setInterval(() => notificationSocket.value?.send({ type: 'PING' }), 25000);
}
function stopNotificationSocket() {
  notificationSync.stop();
  postSync.stop();
  clearInterval(notificationHeartbeat);
  notificationSocket.value?.close?.(); notificationSocket.value = null;
}

function mediaAction(action, value) {
  if (isMuted.value || publishing.value || feedSession.textUnknown) return;
  composerError.value = '';
  try { media.get(mediaTarget)[action](value); } catch (error) { composerError.value = error.message; }
}
function addFiles(files) { mediaAction('add', files); }
function removeImage(id) { mediaAction('remove', id); }
function discardImages() {
  if (!window.confirm('清除本地图片任务？已提交内容可能已发布；清除不会撤回，请先查看动态记录。')) return;
  media.reset(mediaTarget); composerError.value = '';
}

function clearComposer() {
  draft.content = "";
  draft.sceneCode = "default";
  draft.clientRequestId = crypto.randomUUID().replaceAll("-", "");
  draft.images = [];
  media.reset(mediaTarget);
  feedSession.textUnknown=false;feedSession.textPayload=null;
}

async function publishPost() {
  if (publishing.value || isMuted.value || !authStore.user) return;
  const generation=authStore.sessionGeneration,owner=authStore.user?.id;
  const current=()=>generation===authStore.sessionGeneration && owner===authStore.user?.id;
  composerError.value = "";
  if (!canPublish.value) {
    composerError.value = "写点文字，或者上传一张图片再发布。";
    return;
  }
  publishing.value = true;
  try {
    if (imagePreviews.value.length) {
      await media.get(mediaTarget).submit(draft.content, draft.sceneCode);
      if (!current()) return;
      clearComposer();
      feedSession.pages.square.stale=true;
      if(!disposed){closeComposer();await loadPosts();}
      return;
    }
    if(!feedSession.textPayload)feedSession.textPayload={content:draft.content,sceneCode:draft.sceneCode,clientRequestId:draft.clientRequestId};
    const payload={...feedSession.textPayload};
    if(feedSession.textUnknown){
      const receipt=await findFeedPublication(payload.clientRequestId);
      if(!current())return;
      if(receipt?.status==='committed'){clearComposer();feedSession.pages.square.stale=true;if(!disposed){closeComposer();await loadPosts();}return;}
      if(receipt?.status!=='missing')throw new Error('原发布结果尚未确认，请稍后查询。');
    }
    feedSession.textUnknown=true;
    const created = await createFeedPost({...payload,images:[]});
    if (!current()) return;
    if (created) {
      mergeFeedEntities([created]);feedSession.pages.square.ids=[created.id,...feedSession.pages.square.ids.filter(id=>id!==created.id)];
      clearComposer();
      if(!disposed)closeComposer();
    } else {
      throw new Error('发布回包缺少记录，请查询原任务。');
    }
  } catch (error) {
    if (current()) composerError.value = feedSession.textUnknown || mediaState.value.state === 'unknown' ? `结果待确认，请点击“查询并重试原任务”；草稿已保留。${error.message || ''}` : error.message || "发布失败，请稍后再试。";
  } finally {
    if (current()) publishing.value = false;
  }
}

async function toggleLike(post) {
  if(likeBusy[post.id])return;const current=sessionGuard();likeBusy[post.id]=true;
  try{const updated=post.liked?await unlikePost(post.id):await likePost(post.id);if(current() && updated)mergeFeedEntities([updated]);}
  catch(error){if(current())feedError.value=error.message || '点赞结果未确认，请刷新后重试。';}
  finally{if(current()){likeBusy[post.id]=false;postSync.invalidate(String(post.id));}}
}

async function toggleComments(post) {
  if (expandedPostId.value === post.id) {
    expandedPostId.value = null;
    return;
  }
  expandedPostId.value = post.id;
  if (comments[post.id]) return;
  commentsLoading[post.id] = true;
  const current=sessionGuard();
  try {
    const result=await fetchPostComments(post.id);if(current())comments[post.id]=result;
  } catch(error){if(current())feedError.value=error.message || '评论读取失败。';
  } finally {
    if(current())commentsLoading[post.id] = false;
  }
}

async function submitComment(post) {
  const content = (commentDrafts[post.id] || "").trim();
  if (!content || commentBusy[post.id]) return;
  const current=sessionGuard();commentBusy[post.id]=true;
  try {
  const replyTarget = commentReplyTargets[post.id];
  const created = await createPostComment(post.id, {
    content,
    parentId: replyTarget?.id || null,
    replyToUserId: replyTarget?.authorId || null
  });
  if(!current())return;
  feedError.value=created?'':'原评论已提交，但现已不可见；不会重新创建。';
  await loadNotifications();
  }catch(error){if(current())feedError.value=error.message || '评论未确认，请先刷新评论再决定是否重发。';}
  finally{if(current()){commentBusy[post.id]=false;postSync.invalidate(String(post.id));}}
}

function startReply(post, comment) {
  if(createTasks[`comment:${post?.id}`])return;
  if (isMuted.value || !post?.id || !comment?.id) return;
  commentReplyTargets[post.id] = comment;
  commentDrafts[post.id] = commentDrafts[post.id] || "";
}

function clearReply(postId) {
  if(createTasks[`comment:${postId}`])return;
  delete commentReplyTargets[postId];
}

function openDeleteConfirm(post) {
  if(deleting.value)return;deleteTarget.value = post;openMotionDialog(deleteDialog.value);
}

async function removePost() {
  if (!deleteTarget.value || deleting.value) return;
  const id=deleteTarget.value.id,current=sessionGuard();deleting.value=true;
  try{await deleteFeedPost(id);if(!current())return;removeFeedEntity(id);closeMotionDialog(deleteDialog.value);await loadNotifications();}
  catch(error){if(current())feedError.value=error.message || '删除未确认，请刷新后重试同一动态。';}
  finally{if(current())deleting.value=false;}
}

async function onForeground(){
  if(document.visibilityState!=='visible'){stopNotificationSocket();return;}
  connectNotificationSocket();
  await loadCapabilities();if(disposed)return;for(const state of Object.values(feedSession.pages))state.stale=true;
  rememberPosition(); await loadPosts(true,true);
}
onMounted(async () => {
  document.addEventListener('visibilitychange',onForeground);
  connectNotificationSocket();
  {
    const current = sessionGuard();
    mediaSocket = createChatSocket({
      onOpen(recovered) { if (current() && recovered) {for(const state of Object.values(feedSession.pages))state.stale=true;void loadCapabilities();} },
      onMessage(event) {
        if (!current())return;
        if(event?.type==='FOLLOWS_INVALIDATED'){invalidateRelationships();feedSession.pages.square.stale=true;return;}
        if(event?.type==='MEDIA_PUBLICATION_COMMITTED' && event.payload?.kind==='POST')for(const state of Object.values(feedSession.pages))state.stale=true;
      }
    });
  }
  await loadCapabilities();if(disposed)return;
  if(!dualFeed.value && feedSession.stream==='following')feedSession.stream='square';
  // Re-entry must refresh the active stream; cached rows remain visible until success.
  await loadPosts(true);
});

onBeforeUnmount(() => {
  rememberPosition();closeMotionDialog(composerDialog.value, true);closeMotionDialog(deleteDialog.value, true);
  document.removeEventListener('visibilitychange',onForeground);
  disposed = true;
  clearTimeout(mediaRefreshTimer); mediaSocket?.close();
  stopNotificationSocket();
});
</script>

<style scoped>
.feed-page{position:relative;width:100%;height:100dvh;overflow:hidden;color:var(--sr-color-text);background:var(--sr-color-canvas);font-family:var(--sr-font-sans)}
.feed-bg,.feed-shade{position:absolute;inset:0;pointer-events:none}.feed-bg{background-position:center;background-size:cover}.feed-shade{background:rgba(8,11,17,.36)}
.topbar{position:fixed;top:30px;right:46px;z-index:10}.nav-tabs{display:flex;gap:4px;padding:6px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:var(--sr-color-surface)}
button{min-height:44px;padding:0 14px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:rgba(255,255,255,.045);color:inherit;font:500 13px var(--sr-font-sans);cursor:pointer;transition:background-color var(--sr-motion-fast) ease,color var(--sr-motion-fast) ease,border-color var(--sr-motion-fast) ease}
button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,summary:focus-visible,.comment-row:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:3px}
.nav-item.active{background:var(--sr-color-selected)}
.feed-shell{position:absolute;inset:112px 0 90px;width:min(760px,calc(100% - 32px));margin-inline:auto;min-height:0}
.desktop-shell .feed-shell{inset:16px 0;width:min(760px,calc(100% - 32px))}
.feed-list{height:100%;min-height:0;overflow:auto;padding:24px 28px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-panel);background:var(--sr-color-surface-solid);scrollbar-width:thin;scrollbar-color:rgba(180,201,185,.3) transparent;scrollbar-gutter:stable}
.section-head{display:flex;align-items:center;gap:8px;margin-bottom:20px}.section-head>div{flex:1;min-width:0}.section-head h2{margin:0;font-size:26px;font-weight:650;letter-spacing:-.025em}
.eyebrow{margin:0 0 6px;font-size:10px;font-weight:500;letter-spacing:.12em;color:var(--sr-color-text-muted)}
.section-head .soft-chip:first-of-type{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent}
.stream-tabs{position:sticky;top:0;z-index:1;display:flex;gap:4px;padding:4px;border:1px solid var(--sr-color-line);border-radius:calc(var(--sr-radius-control) + 4px);margin-bottom:16px}
.stream-tabs button{min-width:96px;border-color:transparent;background:transparent;color:var(--sr-color-text-muted)}.stream-tabs button[aria-pressed="true"]{background:var(--sr-color-selected);color:var(--sr-color-text);border-color:var(--sr-color-line-strong)}
.activity-notices{margin-bottom:12px;color:var(--sr-color-text-muted);font-size:13px}.activity-notices summary{min-height:44px;display:list-item;align-content:center;cursor:pointer}.activity-notices button{display:block;width:100%;text-align:left;margin-top:6px;line-height:1.6}
.new-content{width:100%;margin-bottom:12px;background:var(--sr-color-selected);line-height:1.6;padding:10px}
.error-text{padding:12px;border:1px solid rgba(255,143,134,.25);border-radius:var(--sr-radius-control);background:rgba(145,45,35,.12);color:#f7bab4;line-height:1.6;font-size:13px}.error-text button{margin:8px}
.empty-state{min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px 16px;color:var(--sr-color-text-muted);line-height:1.8;text-align:center}
.post-card{padding:24px 0;border-top:1px solid var(--sr-color-line)}.post-head{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.post-head>div:nth-child(2){flex:1;min-width:100px}.post-head strong{font-size:14px;font-weight:600}.post-head span{display:block;margin-top:4px;color:var(--sr-color-text-muted);font-size:12px;line-height:1.5}.post-head em{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;font-size:11px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);color:var(--sr-color-text-muted)}
.avatar{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;overflow:hidden;border-radius:14px;background:var(--sr-color-selected);color:var(--sr-color-text);font-size:18px;font-weight:600}.avatar img{width:100%;height:100%;object-fit:cover}.avatar span{margin:0;font-size:18px;color:inherit}
.post-content{margin:16px 0;color:var(--sr-color-text);font-size:15px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}
.post-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.post-actions button{background:transparent;border-color:transparent}.post-actions button.active{background:var(--sr-color-selected);border-color:var(--sr-color-line-strong)}.post-actions .danger-action{margin-left:auto;color:var(--sr-color-danger)}
.comments-panel{margin-top:16px;padding-top:12px;border-top:1px solid var(--sr-color-line)}.comment-row{display:flex;gap:10px;min-height:44px;padding:12px 6px;border-radius:var(--sr-radius-control);cursor:pointer}.comment-row>span{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:10px;background:var(--sr-color-selected);font-size:12px}.comment-row>div{min-width:0}.comment-row strong{font-size:13px;font-weight:600}.comment-row p{font-size:14px;line-height:1.7;margin:4px 0;overflow-wrap:anywhere}.comment-row small,.comment-empty{font-size:12px;color:var(--sr-color-text-muted);line-height:1.6}
.comment-form{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.comment-form input{flex:1;min-width:0;min-height:44px;padding:0 12px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-control);background:var(--sr-color-surface-solid);color:var(--sr-color-text);font:inherit;font-size:14px}.comment-form input::placeholder{color:var(--sr-color-text-muted)}.comment-form input:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}.reply-target{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:4px 10px;border-radius:10px;background:var(--sr-color-selected);font-size:12px}
.load-more{display:block;width:100%;margin-top:12px}
.publisher-dialog,.delete-dialog{color:var(--sr-color-text);background:var(--sr-color-surface-solid);border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-panel);max-height:calc(100dvh - 40px);overflow:auto;box-shadow:0 24px 80px rgba(0,5,2,.38)}
.publisher-dialog{width:min(640px,calc(100vw - 32px));padding:0}.publisher-heading{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;border-bottom:1px solid var(--sr-color-line);background:var(--sr-color-surface-solid);font-weight:600}
.publisher-dialog::backdrop,.delete-dialog::backdrop{background:rgba(5,8,14,.5)}
.publisher-dialog :deep(.composer-panel){height:auto;max-height:none;overflow:visible}.publisher-dialog :deep(textarea){min-height:160px}
.delete-dialog{width:min(440px,calc(100vw - 32px));padding:28px}.delete-dialog h2{margin:0;font-size:24px;font-weight:650}.delete-dialog>p:not(.eyebrow){color:var(--sr-color-text-muted);font-size:14px;line-height:1.7}.confirm-mark{display:grid;place-items:center;width:40px;height:40px;margin-bottom:16px;border-radius:12px;background:rgba(255,143,134,.12);color:var(--sr-color-danger);font-size:22px}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.confirm-danger{background:rgba(164,61,49,.28);border-color:rgba(255,143,134,.3);color:#ffc9c3}
@media(hover:hover) and (pointer:fine){button:not(:disabled):hover{background-color:rgba(255,255,255,.09)}.section-head .soft-chip:first-of-type:hover{background:var(--sr-color-accent)}.comment-row:hover{background:rgba(255,255,255,.035)}button:not(:disabled):active{filter:brightness(.93)}}
@media(max-width:800px){.feed-shell,.desktop-shell .feed-shell{inset:8px;width:calc(100% - 16px)}.feed-list{padding:20px 16px;border-radius:16px}.section-head h2{font-size:22px}.post-card{padding:20px 0}.post-head em{max-width:76px}.publisher-dialog{width:100%;max-width:none;height:100dvh;max-height:100dvh;border:0;border-radius:0;margin:0}.publisher-heading{padding:12px 16px}.comment-form input{font-size:16px}}
@media(prefers-reduced-transparency:reduce){.feed-list{background:var(--sr-color-surface-solid)}}
.sr-reduced-transparency .feed-list{background:var(--sr-color-surface-solid)}
</style>
