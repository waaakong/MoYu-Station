<template>
  <section class="admin-panel">
    <header class="admin-section-head"><div><p>ACCOUNT GOVERNANCE</p><h1>用户管理</h1></div><button type="button" @click="$emit('retry')">刷新</button></header>
    <div class="role-filter" role="group" aria-label="筛选用户角色" :class="{ 'keyboard-change': keyboardChange }" :style="{ '--selected': filterIndex }">
      <span class="role-filter__selection" aria-hidden="true"></span>
      <button v-for="option in filters" :key="option.value" type="button" :aria-pressed="filter===option.value" @pointerdown="keyboardChange=false" @keydown="keyboardChange=true" @click="admin.filterUsers(option.value)">{{ option.label }}</button>
    </div>
    <AdminState :loading="loading" :error="error" @retry="$emit('retry')" />
    <div v-if="!loading&&!error" class="admin-list">
      <article v-for="user in filteredUsers" :key="user.id">
        <div><strong>{{ user.nickname||user.username }}</strong><span>@{{ user.username }} · 今日专注 {{ user.todayFocusMinutes||0 }} 分钟</span><small v-if="user.adminVersion==null">当前只读：版本化管理未启用</small></div>
        <div class="admin-row-actions">
          <AppSelect :disabled="user.adminVersion==null||admin.recordBusy.has('users:'+user.id)||admin.reverifyOpen" :value="user.userType" :aria-label="`${user.username} 的角色`" @change="requestRole(user,$event)"><option v-for="option in roles" :key="option.value" :value="option.value">{{ option.label }}</option></AppSelect>
          <button type="button" :disabled="user.adminVersion==null||admin.recordBusy.has('users:'+user.id)||admin.reverifyOpen" @click="openReset(user)">重置密码</button>
        </div>
      </article>
      <p v-if="!filteredUsers.length" class="admin-empty">{{ users.length ? '当前筛选下没有用户。' : '暂无用户。' }}</p>
    </div>
    <dialog ref="resetDialog" class="admin-modal sr-glass sr-glass--floating" aria-labelledby="reset-title" @keydown="containDialogFocus" @cancel.prevent="closeReset" @close="passwordUser=null">
      <form @submit.prevent="submitReset">
        <h2 id="reset-title">重置 {{ passwordUser?.username }} 的密码</h2>
        <p class="admin-note">完成后仍需验证管理员身份，不会立即修改账号。</p>
        <label>新密码<input ref="passwordInput" v-model="password" type="password" autocomplete="new-password" required minlength="12" /></label>
        <label>确认密码<input v-model="confirmation" type="password" autocomplete="new-password" required minlength="12" /></label>
        <p v-if="passwordError" class="admin-form-error" role="alert">{{ passwordError }}</p>
        <footer><button type="button" @click="closeReset">取消</button><button class="primary" type="submit">继续</button></footer>
      </form>
    </dialog>
  </section>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import { computed,nextTick,onBeforeUnmount,ref } from "vue";
import type { AdminUser } from "../../services/admin";
import AdminState from "./AdminState.vue";
import { containDialogFocus } from "./dialogFocus";
import {useAdminStore} from '../../stores/admin';
const admin=useAdminStore();
const props=defineProps<{users:AdminUser[];loading:boolean;error?:string}>();
const emit=defineEmits<{retry:[];role:[user:AdminUser,role:string];password:[user:AdminUser,password:string]}>();
const roles=[{value:"NORMAL",label:"普通用户"},{value:"MUTED",label:"禁言"},{value:"BANNED",label:"封禁"},{value:"ADMIN",label:"管理员"}];
const filters=[{value:"ALL",label:"全部"},...roles],filter=computed(()=>admin.userFilter),keyboardChange=ref(false);
const filterIndex=computed(()=>filters.findIndex(option=>option.value===filter.value));
const filteredUsers=computed(()=>props.users);
const passwordUser=ref<AdminUser|null>(null),password=ref(""),confirmation=ref(""),passwordError=ref("");
const resetDialog=ref<HTMLDialogElement>(),passwordInput=ref<HTMLInputElement>();
let trigger:HTMLElement|null=null;
function requestRole(user:AdminUser,event:Event){const input=event.target as HTMLSelectElement;const next=input.value;input.value=user.userType;emit("role",user,next);}
async function openReset(user:AdminUser){
  trigger=document.activeElement as HTMLElement;passwordUser.value=user;password.value="";confirmation.value="";passwordError.value="";
  await nextTick();openMotionDialog(resetDialog.value);passwordInput.value?.focus();
}
function closeReset(){password.value="";confirmation.value="";closeMotionDialog(resetDialog.value,false,()=>{passwordUser.value=null;trigger?.focus();});}
function submitReset(){
  if(password.value!==confirmation.value){passwordError.value="两次密码不一致。";return;}
  if(password.value.length<12){passwordError.value="密码至少 12 位。";return;}
  const user=passwordUser.value,value=password.value;closeReset();if(user)emit("password",user,value);
}
onBeforeUnmount(()=>closeMotionDialog(resetDialog.value, true));
</script>
<style scoped>
.role-filter{position:relative;isolation:isolate;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;max-width:560px;padding:4px;margin-bottom:20px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control);background:rgba(0,0,0,.18)}
.role-filter button{position:relative;z-index:1;min-width:0;min-height:40px;padding:0 8px;background:transparent;border:0;color:var(--sr-color-text-muted);font-weight:500}
.role-filter button[aria-pressed="true"]{color:var(--sr-color-text)}
.role-filter__selection{position:absolute;z-index:0;inset:4px auto 4px 4px;width:calc((100% - 8px)/5);border-radius:9px;background:var(--sr-color-selected);box-shadow:0 1px 4px #0003,inset 0 1px #ffffff12;transform:translateX(calc(var(--selected)*100%));transition:transform var(--sr-motion-medium) var(--sr-ease-out)}
.keyboard-change .role-filter__selection{transition:none}
.admin-modal form{display:grid;gap:16px}.admin-modal form>p{margin:0}.admin-modal form footer{margin-top:4px}
@media(max-width:480px){.role-filter button{font-size:12px;padding:0 4px;min-height:44px}}
@media(prefers-reduced-motion:reduce){.role-filter__selection{transition:none}}
.sr-reduced-motion .role-filter__selection{transition:none}
@media(hover:hover) and (pointer:fine){.role-filter button:hover{background:rgba(255,255,255,.04)}}
</style>
