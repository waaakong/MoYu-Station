<template>
  <section class="profile-panel" aria-labelledby="profile-posts-title">
    <header class="profile-section-head"><div><p>POSTS</p><h1 id="profile-posts-title">我的动态</h1></div><span>最多显示 50 条</span></header>
    <div v-if="error" class="profile-state error" role="alert">{{ error }}<button type="button" @click="$emit('retry')">重试</button></div>
    <div v-else-if="loading && !posts.length" class="profile-state" role="status">正在读取动态…</div>
    <div v-else-if="posts.length" class="profile-post-list">
      <article v-for="post in posts" :key="post.id">
        <header><div><small>{{ post.createdAt || "时间未记录" }}</small><strong>{{ post.sceneName || "未记录场景" }}</strong></div><button type="button" @click="$emit('remove', post.id)">删除</button></header>
        <p>{{ post.content }}</p><footer>{{ post.likeCount || 0 }} 点赞 · {{ post.commentCount || 0 }} 评论</footer>
      </article>
    </div>
    <div v-else class="profile-state">还没有发布过动态。</div>
  </section>
</template>

<script setup lang="ts">
import type { ProfilePost } from "../../services/profile";
defineProps<{ posts: ProfilePost[]; loading: boolean; error?: string }>();
defineEmits<{ retry: []; remove: [postId: string | number] }>();
</script>
