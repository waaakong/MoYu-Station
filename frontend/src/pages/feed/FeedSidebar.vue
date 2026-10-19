<template>
  <aside class="feed-side glass">
    <section class="side-card">
      <h2>热门话题</h2>
      <button v-for="topic in topics" :key="topic.name" type="button" @click="$emit('insert-topic', topic.name)"><span>{{ topic.name }}</span><strong>{{ topic.count }}</strong></button>
      <p v-if="!topics.length" class="notice-empty">还没有热门话题，发布动态时添加 #话题# 后会出现在这里。</p>
    </section>
    <section class="side-card">
      <h2>推荐场景</h2>
      <button v-for="scene in scenes" :key="scene.name" type="button" :class="{ active: selectedScene === scene.key }" @click="$emit('select-scene', scene.key)"><span>{{ scene.name }}</span><strong>{{ scene.mood }}</strong></button>
    </section>
    <section class="side-card">
      <h2>互动通知</h2>
      <button v-for="notice in notifications" :key="notice.key" class="notice-row" type="button" @click="$emit('open-notice', notice)"><span>{{ notice.text }}</span></button>
      <p v-if="notificationError" class="notice-empty">{{ notificationError }} <button type="button" @click="$emit('retry-notifications')">重试</button></p>
      <p v-else-if="!notifications.length" class="notice-empty">还没有新的互动。</p>
    </section>
  </aside>
</template>

<script setup lang="ts">
type Topic = { name: string; count: number };
type Scene = { key: string; name: string; mood: string };
type Notice = { key: string; text: string; postId?: string | number };
defineProps<{ topics: Topic[]; scenes: Scene[]; selectedScene: string; notifications: Notice[]; notificationError?: string }>();
defineEmits<{ "insert-topic": [topic: string]; "select-scene": [key: string]; "open-notice": [notice: Notice]; "retry-notifications": [] }>();
</script>

<style scoped>
.feed-side{display:grid;gap:14px;align-content:start;width:100%;box-sizing:border-box;align-self:start;padding:24px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.42) transparent}.side-card{padding:18px;border:1px solid rgba(255,255,255,.14);border-radius:22px;background:rgba(0,0,0,.2)}h2{margin:0 0 12px;font-size:18px}.side-card button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:36px;border:0;border-bottom:1px solid rgba(255,255,255,.1);background:transparent;color:rgba(255,255,255,.72);font:800 14px inherit;text-align:left;cursor:pointer;transition:color 180ms ease,transform 180ms ease,background 180ms ease,padding 180ms ease}.side-card button:hover,.side-card button.active{padding-inline:10px;border-radius:14px;color:#fff;background:rgba(255,255,255,.12);transform:translateX(2px)}.side-card button:last-child,.side-card p:last-child{border-bottom:0}.side-card p{margin:0;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.72);font-weight:800;font-size:14px;line-height:1.45}.notice-row span{line-height:1.45}.notice-empty button{display:inline;width:auto;min-height:0;margin-top:6px;border:0;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.12)}
</style>
