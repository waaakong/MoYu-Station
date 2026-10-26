<template>
  <section class="admin-panel">
    <header class="admin-section-head"><div><p>USER FEEDBACK</p><h1>反馈</h1></div><button type="button" @click="$emit('retry')">刷新</button></header>
    <AdminState :loading="loading" :error="error" @retry="$emit('retry')"/>
    <div v-if="!loading&&!error" class="admin-list"><article v-for="item in feedback" :key="item.id">
      <div><strong>{{ item.title }} · {{ item.author }}</strong><span>{{ item.content }}</span><small v-if="item.adminVersion==null">当前只读：版本化管理未启用</small></div>
      <div class="admin-row-actions"><AppSelect :disabled="blocked(item)" :value="item.status" :aria-label="`${item.title} 的状态`" @change="requestStatus(item,$event)"><option v-for="status in statuses" :key="status" :value="status">{{ statusLabels[status] }}</option></AppSelect><button class="danger" type="button" :disabled="blocked(item)" @click="target={...item}">删除</button></div>
    </article><p v-if="!feedback.length" class="admin-empty">暂无反馈。</p></div>
    <ConfirmDialog v-if="target" title="删除反馈" :message="`删除反馈「${target.title}」后无法恢复。`" @cancel="target=null" @confirm="confirm"/>
  </section>
</template>
<script setup lang="ts">
import {ref} from 'vue';import type {AdminFeedback} from '../../services/admin';import {useAdminStore} from '../../stores/admin';
import AdminState from './AdminState.vue';import ConfirmDialog from './ConfirmDialog.vue';
defineProps<{feedback:AdminFeedback[];loading:boolean;error?:string}>();
const emit=defineEmits<{retry:[];status:[item:AdminFeedback,status:string];remove:[item:AdminFeedback]}>();
const admin=useAdminStore(),statuses=['PENDING','PROCESSING','RECORDED','RESOLVED'] as const,target=ref<AdminFeedback|null>(null);
const statusLabels={PENDING:'待处理',PROCESSING:'处理中',RECORDED:'已记录',RESOLVED:'已解决'};
function blocked(item:AdminFeedback){return item.adminVersion==null||admin.recordBusy.has('feedback:'+item.id)||admin.reverifyOpen;}
function requestStatus(item:AdminFeedback,event:Event){const input=event.target as HTMLSelectElement,next=input.value;input.value=item.status;emit('status',item,next);}
function confirm(){if(target.value)emit('remove',target.value);target.value=null;}
</script>
