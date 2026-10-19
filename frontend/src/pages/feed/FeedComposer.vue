<template>
  <section class="composer-panel glass" :class="{ dragging: isDraggingFiles }" @dragenter.prevent="isDraggingFiles = true" @dragover.prevent @dragleave.prevent="isDraggingFiles = false" @drop.prevent="onDrop">
    <div class="composer-head">
      <div class="avatar">
        <img v-if="avatar" :src="assetUrl(avatar)" alt="头像" loading="lazy" decoding="async" />
        <span v-else>{{ avatarText(name) }}</span>
      </div>
      <div><p class="eyebrow">SHARE A MOMENT</p><h1>这一刻，想说点什么？</h1><span>{{ name }}</span></div>
    </div>
    <div v-if="muted" class="muted-warning">当前账号已被禁言，可以浏览动态，但不能发布和评论。</div>
    <label class="composer-field">
      <span class="sr-visually-hidden">动态正文</span>
      <textarea :value="content" :disabled="muted || publishing || locked" maxlength="500" placeholder="有什么新鲜事想分享？写下今天的状态、学习片段，或留给自己的小记录。" @input="emit('update:content', $event.target.value)" @paste="onPaste"></textarea>
    </label>
    <div class="composer-tools">
      <button type="button" :disabled="muted || publishing || locked" @click="emojiOpen = true">表情</button><button type="button" :disabled="muted || publishing || locked" @click="emit('insert-text', '#今日专注# ')"># 话题</button>
    </div>
    <StickerPanel v-if="emojiOpen && !muted && !publishing && !locked" text-only @close="emojiOpen = false" @insert="emit('insert-text', $event)" />
    <section class="theme-strip" aria-label="动态背景主题">
      <button v-for="theme in themes" :key="theme.key" class="theme-chip" :class="{ active: sceneCode === theme.key }" :aria-pressed="sceneCode === theme.key" :disabled="locked || publishing" type="button" @click="emit('select-theme', theme.key)">
        <span class="theme-thumb" :style="themeThumbStyle(theme)"></span><span>{{ theme.name }}</span>
      </button>
    </section>
    <MediaAttachments :items="previews" :enabled="mediaEnabled" :disabled="muted || publishing" :locked="locked" :state="publicationState"
      @add="emit('add-files', $event)" @remove="emit('remove-image', $event)" @retry="emit('retry-image', $event)" @cancel="emit('cancel-image', $event)" @reorder="emit('reorder-images', $event)" @discard="emit('discard-images')" />
    <p class="limit-copy">最多 500 字、9 张静态图片。选图不会自动发布；关闭和切页保留草稿，退出账号清空。</p>
    <p v-if="error" class="error-text">{{ error }}</p>
    <button class="publish-btn" type="button" :disabled="muted || publishing || processingImages || !canPublish" @click="emit('publish')">{{ publishing ? "发布中..." : publicationState === 'unknown' ? '查询并重试原任务' : processingImages ? "图片处理中..." : "发布" }}</button>
  </section>
</template>

<script setup>
import { ref } from "vue";
import MediaAttachments from "../../components/media/MediaAttachments.vue";
import StickerPanel from '../../stickers/StickerPanel.vue';

defineProps({ name: { type: String, required: true }, avatar: { type: String, default: "" }, content: { type: String, default: "" }, sceneCode: { type: String, required: true }, themes: { type: Array, required: true }, previews: { type: Array, required: true }, muted: Boolean, publishing: Boolean, processingImages: Boolean, canPublish: Boolean, mediaEnabled: Boolean, locked: Boolean, publicationState: String, error: { type: String, default: "" }, assetUrl: { type: Function, required: true }, avatarText: { type: Function, required: true }, themeThumbStyle: { type: Function, required: true } });
const emit = defineEmits(["update:content", "insert-text", "select-theme", "add-files", "remove-image", "retry-image", "cancel-image", "reorder-images", "discard-images", "publish"]);
const isDraggingFiles = ref(false);
const emojiOpen = ref(false);
function onDrop(event) { isDraggingFiles.value = false; if (event.dataTransfer?.files?.length) emit("add-files", Array.from(event.dataTransfer.files)); }
function onPaste(event) { if (event.clipboardData?.files?.length) { event.preventDefault(); emit('add-files', Array.from(event.clipboardData.files)); } }
</script>

<style scoped>
.composer-panel{align-self:start;height:100%;overflow-y:auto;box-sizing:border-box;padding:24px;transition:border-color 220ms ease,background 220ms ease}.composer-panel::-webkit-scrollbar{width:6px}.composer-panel::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(255,255,255,.34)}.composer-panel.dragging{border-color:rgba(255,255,255,.76);background:linear-gradient(135deg,rgba(255,255,255,.24),rgba(35,45,61,.72))}.composer-head,.image-uploader{display:flex;align-items:center}.composer-head{gap:16px;margin-bottom:20px}.avatar{display:grid;place-items:center;width:64px;height:64px;overflow:hidden;border-radius:18px;background:linear-gradient(135deg,rgba(222,234,250,.72),rgba(64,78,98,.8));font-size:26px;font-weight:950}.avatar img{width:100%;height:100%;object-fit:cover}.eyebrow{margin:0 0 8px;color:rgba(255,255,255,.68);font-size:12px;font-weight:950;letter-spacing:.12em}h1{margin:0;font-weight:950}.composer-head span,.limit-copy{color:rgba(255,255,255,.72)}.muted-warning,.error-text{margin-bottom:14px;padding:12px 14px;border-radius:14px;color:#fff2ea;font-weight:900;background:rgba(130,88,74,.44)}.composer-field textarea{width:100%;min-height:220px;resize:none;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:18px;color:#fff;line-height:1.7;background:rgba(0,0,0,.24);outline:none}.composer-field textarea::placeholder{color:rgba(255,255,255,.52)}.composer-tools,.theme-strip,.preview-actions{display:flex;align-items:center;gap:8px}.composer-tools{margin-top:12px}.composer-tools button{height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#fff;font-weight:900;background:rgba(255,255,255,.12);cursor:pointer;transition:transform 220ms ease,background 220ms ease}.composer-tools button:hover{transform:translateY(-1px);background:rgba(255,255,255,.22)}.theme-strip{margin:18px -2px 16px;padding:2px 2px 8px;overflow-x:auto}.theme-chip{display:inline-flex;flex:0 0 auto;align-items:center;gap:8px;min-width:112px;height:42px;padding:5px 10px 5px 5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;color:rgba(255,255,255,.82);font-weight:900;background:rgba(255,255,255,.08);cursor:pointer;transition:transform 220ms ease,background 220ms ease,border-color 220ms ease}.theme-chip:hover{transform:translateY(-1px);background:rgba(255,255,255,.14)}.theme-chip.active{border-color:rgba(255,255,255,.78);background:rgba(255,255,255,.22)}.theme-thumb{width:32px;height:32px;border-radius:50%;background-position:center;background-size:cover;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}.image-uploader{gap:12px;padding:12px;border:1px dashed rgba(255,255,255,.24);border-radius:20px;background:rgba(255,255,255,.07)}.image-uploader strong,.image-uploader span{display:block}.image-uploader span{margin-top:3px;color:rgba(255,255,255,.62);font-size:12px}.plus-upload{display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:14px;color:#121514;background:rgba(255,255,255,.92);font-size:26px;font-weight:600;cursor:pointer}.file-input{display:none}.preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.preview-grid article{position:relative;overflow:hidden;border:0;border-radius:18px;padding:0;background:rgba(255,255,255,.08);aspect-ratio:1;cursor:grab;transition:opacity 180ms ease,transform 180ms ease,box-shadow 180ms ease}.preview-grid article.sorting{opacity:.64;transform:scale(.96);box-shadow:0 0 0 2px rgba(255,255,255,.45)}.preview-grid img{display:block;width:100%;height:100%;object-fit:cover}.preview-actions{display:none}.preview-remove{position:absolute;top:8px;right:8px;z-index:2;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:50%;padding:0;color:#fff;background:#cf3f3f;box-shadow:0 8px 20px rgba(0,0,0,.32);font-weight:900;line-height:1;cursor:pointer;opacity:0;transform:scale(.72);transition:opacity 160ms ease,transform 160ms ease,background 160ms ease}.preview-grid article:hover .preview-remove{opacity:1;transform:scale(1)}.preview-remove:hover{background:#ff4f4f}.limit-copy{margin:10px 0 0;font-size:12px}.publish-btn{width:100%;min-height:52px;margin-top:18px;border:0;border-radius:999px;color:#111;font-size:16px;font-weight:950;background:#f2f2ee;cursor:pointer;transition:transform 220ms ease,opacity 220ms ease,background 220ms ease}.publish-btn:not(:disabled):hover{transform:translateY(-1px);background:#fff}.publish-btn:disabled,.plus-upload:disabled{opacity:.48;cursor:default}
.composer-tools{flex-wrap:wrap}.composer-tools button{flex:0 0 auto;white-space:nowrap;min-height:44px}
@media(prefers-reduced-motion:reduce){.composer-panel,.composer-tools button,.theme-chip,.publish-btn{transition:none}}
</style>
<style scoped>
.composer-panel{padding:24px;background:transparent;border:0;box-shadow:none;backdrop-filter:none}
.composer-head{gap:12px;margin-bottom:20px}.avatar{width:44px;height:44px;flex:0 0 44px;border-radius:14px;font-size:20px;background:var(--sr-color-selected)}
.composer-head h1{font-size:20px;font-weight:600;line-height:1.4}.eyebrow{display:none}.composer-head span{display:block;margin-top:4px;font-size:12px;color:var(--sr-color-text-muted)}
.composer-field textarea{border-radius:var(--sr-radius-control);font:400 15px/1.8 var(--sr-font-sans);padding:14px;border-color:var(--sr-color-line-strong);background:rgba(0,0,0,.18);color:var(--sr-color-text)}
.composer-field textarea:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}
.composer-field textarea::placeholder,.limit-copy{color:var(--sr-color-text-muted)}
.composer-tools button,.theme-chip,.publish-btn{border-radius:var(--sr-radius-control);font-weight:500;min-height:44px;transition:background-color var(--sr-motion-fast) ease,border-color var(--sr-motion-fast) ease}
.theme-thumb{border-radius:8px}.theme-chip{background:rgba(255,255,255,.03)}.theme-chip.active{background:var(--sr-color-selected);border-color:var(--sr-color-line-strong)}
.theme-strip{scrollbar-width:thin;scrollbar-color:rgba(180,201,185,.3) transparent}
.composer-tools button:hover,.theme-chip:hover,.publish-btn:not(:disabled):hover{transform:none}
.publish-btn{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);min-height:48px;font-weight:600}
button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}
@media(hover:none){.composer-tools button:hover,.theme-chip:hover{background:rgba(255,255,255,.08)}}
@media(max-width:800px){.composer-panel{padding:20px 16px}.composer-field textarea{font-size:16px}}
</style>
