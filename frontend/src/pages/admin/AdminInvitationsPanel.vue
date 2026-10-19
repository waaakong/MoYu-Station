<template>
  <section class="admin-panel">
    <header class="admin-section-head"><div><p>INVITATION CONTROL</p><h1>邀请码</h1></div><button type="button" @click="$emit('retry')">刷新</button></header>
    <form class="admin-inline-form" @submit.prevent="create">
      <label>用途<input v-model.trim="draft.label" :readonly="locked" required maxlength="100" /></label>
      <label>次数<input v-model.number="draft.maxUses" :readonly="locked" type="number" min="1" max="100" required /></label>
      <div class="admin-date-field"><span>到期时间</span><span v-if="locked">{{ draft.expiresAt || '未设置' }}</span><AdminDateTimePicker v-else v-model="draft.expiresAt" /></div>
      <button type="submit" :disabled="createTasks.invitation?.busy || admin.reverifyOpen">{{ createTasks.invitation?.busy ? '提交中…' : createTasks.invitation?.unknown ? '核对并重试' : '创建邀请码' }}</button>
    </form>
    <p class="admin-note">邀请码原文只在首次创建成功时返回；回包丢失后核对原记录，不自动生成新码。失败或身份复验取消不会清空草稿。</p>
    <p v-if="admin.invitationMessage" role="status" class="admin-note">{{ admin.invitationMessage }}</p>
    <AdminState :loading="loading" :error="error" @retry="$emit('retry')"/>
    <p v-if="!loading&&!admin.accessEnabled.invitations" role="status">版本化停用尚未启用，已有邀请码只读。</p>
    <div v-if="!loading&&!error" class="admin-list"><article v-for="item in invitations" :key="item.id"><div><strong>{{ item.label }}</strong><span>{{ item.code||item.codeHint||'原文已隐藏' }} · {{ item.usedCount }}/{{ item.maxUses }} · {{ item.status }}</span></div><button type="button" :disabled="item.status==='DISABLED'||item.adminVersion==null||admin.recordBusy.has('invitations:'+item.id)||admin.reverifyOpen" @click="$emit('disable',item)">停用</button></article></div>
    <button v-if="admin.accessCursors.invitations" type="button" :disabled="admin.accessBusy.has('invitations')" @click="admin.loadMoreAccess('invitations')">加载更多邀请码</button>
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import AdminDateTimePicker from './AdminDateTimePicker.vue';
import type {Invitation} from '../../services/admin';
import AdminState from './AdminState.vue';
import {useAdminStore} from '../../stores/admin';
import {createTasks,invitationDraft as draft} from '../../services/reliableCreate';
defineProps<{invitations:Invitation[];loading:boolean;error?:string}>();
const emit=defineEmits<{retry:[];create:[payload:{label:string;maxUses:number;expiresAt?:string}];disable:[item:Invitation]}>();
const admin=useAdminStore();
const locked=computed(()=>Boolean(createTasks.invitation) || admin.reverifyOpen);
function create(){if(createTasks.invitation?.busy || admin.reverifyOpen)return;emit('create',{label:draft.label,maxUses:draft.maxUses,expiresAt:draft.expiresAt||undefined});}
</script>
<style scoped>.admin-date-field{display:grid;gap:7px;min-width:0;color:var(--sr-color-text-muted);font-size:12px}</style>
