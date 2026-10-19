<template>
  <section class="profile-panel" aria-labelledby="profile-feedback-title">
    <header class="profile-section-head"><div><p>FEEDBACK</p><h1 id="profile-feedback-title">反馈建议</h1></div><span>发送给管理员</span></header>
    <p class="profile-lead">问题、建议和功能想法会进入管理员工作台；请勿填写密码、Cookie 或第三方平台凭据。</p>
    <form class="profile-feedback-form" @submit.prevent="submit">
      <label for="feedback-title">反馈标题</label><input id="feedback-title" v-model.trim="title" :readonly="locked" maxlength="100" required />
      <label for="feedback-content">详细内容</label><textarea id="feedback-content" v-model.trim="content" :readonly="locked" maxlength="360" rows="8" required></textarea>
      <p v-if="message" role="status" class="profile-message">{{ message }}</p>
      <p v-if="createTasks.feedback?.unknown && !message" class="profile-message">原提交待核对，暂不修改内容；切换页面保留草稿，退出或刷新后清除。</p>
      <button type="submit" :disabled="sending || createTasks.feedback?.busy">{{ sending || createTasks.feedback?.busy ? "提交中…" : createTasks.feedback?.unknown ? "核对并重试" : "提交反馈" }}</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, toRefs, computed, onBeforeUnmount } from "vue";
import { createTasks, feedbackDraft } from '../../services/reliableCreate';
const emit = defineEmits<{ submit: [payload: { title: string; content: string; feedbackType: string }, done: (error?: string) => void] }>();
const {title,content}=toRefs(feedbackDraft); const sending = ref(false); const message = ref("");
const locked=computed(()=>sending.value || Boolean(createTasks.feedback));
let disposed=false;onBeforeUnmount(()=>{disposed=true;});
function submit() {
  if (!title.value || !content.value || sending.value) return;
  sending.value = true; message.value = "";
  emit("submit", { title: title.value, content: content.value, feedbackType: "SUGGESTION" }, (error) => {
    if(disposed)return;
    sending.value = false; message.value = error || "反馈已提交。";
    if (!error) { title.value = ""; content.value = ""; }
  });
}
</script>
