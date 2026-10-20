<template>
  <section class="admin-panel">
    <header class="admin-section-head"><div><p>PRIVATE CLIENT RELEASES</p><h1>客户端发布</h1></div><button type="button" @click="$emit('retry')">刷新</button></header>
    <AdminState :loading="loading" :error="error" @retry="$emit('retry')"/>
    <p v-if="admin.releaseMessage" role="status">{{ admin.releaseMessage }}</p>
    <section v-if="admin.membershipIntent" class="release-confirm admin-glass" aria-label="确认成员权限" tabindex="-1" ref="memberConfirmation">
      <h2>确认成员权限</h2>
      <p>{{ admin.membershipIntent.original.username }} · {{ admin.membershipIntent.original.channel }} · 修订 {{ admin.membershipIntent.original.adminVersion }}</p>
      <p>当前{{ admin.membershipIntent.original.enabled?'已授权':'未授权' }} → {{ admin.membershipIntent.enabled?'授权':'撤销' }}</p>
      <p>原因：{{ admin.membershipIntent.reason }}</p><p role="status">{{ admin.membershipIntent.message }}</p>
      <div class="admin-row-actions">
        <button v-if="admin.membershipIntent.state==='review'" type="button" :disabled="admin.membershipBusy||admin.reverifyOpen" @click="admin.submitMembership()">确认成员变更</button>
        <button v-else type="button" :disabled="admin.membershipBusy" @click="admin.inspectMembership()">核对当前成员</button>
        <button type="button" :disabled="admin.membershipBusy" @click="cancelMember">关闭成员确认</button>
      </div>
    </section>
    <section v-if="admin.releaseIntent" class="release-confirm admin-glass" aria-label="确认发布策略" tabindex="-1" ref="confirmation">
      <h2>确认发布策略</h2>
      <p>{{ admin.releaseIntent.original.version }} · {{ admin.releaseIntent.original.channel }} · 修订 {{ admin.releaseIntent.original.policyVersion }}</p>
      <p>{{ admin.releaseIntent.original.status }} → {{ admin.releaseIntent.patch.status }} · {{ admin.releaseIntent.patch.rolloutPercentage }}%</p>
      <p>原因：{{ admin.releaseIntent.patch.reason }}</p>
      <p v-if="admin.releaseIntent.patch.status==='WITHDRAWN'">撤回是终态，该版本不能恢复发布。</p>
      <p v-if="admin.releaseIntent.message" role="status">{{ admin.releaseIntent.message }}</p>
      <p v-if="admin.releaseIntent.latest">最新策略：{{ admin.releaseIntent.latest.status }} · {{ admin.releaseIntent.latest.rolloutPercentage }}% · 修订 {{ admin.releaseIntent.latest.policyVersion }}</p>
      <div class="admin-row-actions">
        <button v-if="admin.releaseIntent.state==='review'" type="button" :disabled="admin.releaseBusy||admin.reverifyOpen" @click="admin.submitRelease()">{{ admin.releaseBusy?'提交中…':'确认提交' }}</button>
        <button v-if="admin.releaseIntent.state!=='review'" type="button" :disabled="admin.releaseBusy" @click="admin.inspectRelease()">核对当前策略</button>
        <button v-if="admin.releaseIntent.latest && admin.releaseIntent.state==='conflict' && admin.releaseIntent.latest.status!=='WITHDRAWN' && admin.releaseIntent.latest.policyVersion!=null" type="button" :disabled="admin.releaseBusy" @click="admin.rebaseRelease()">采用最新版本，重新确认</button>
        <button type="button" :disabled="admin.releaseBusy" @click="cancel">关闭确认</button>
      </div>
    </section>
    <template v-if="!loading&&!error">
      <p v-if="!admin.releasePolicyEnabled" role="status">版本化发布管理未启用：当前只读，不会退回无版本校验的修改。</p>
      <form class="admin-inline-form" @submit.prevent="membership(true)">
        <label>圈内账号<AppSelect v-model="userId" required><option :value="0" disabled>选择账号</option><option v-for="user in users" :key="user.id" :value="user.id">{{ user.nickname||user.username }}</option></AppSelect></label>
        <label>通道<AppSelect v-model="channel"><option v-for="item in channels" :key="item" :value="item">{{ item }}</option></AppSelect></label>
        <label>审计原因<input v-model.trim="reason" required maxlength="300" /></label>
        <button type="submit" :disabled="!admin.accessEnabled.members||admin.membershipBusy||!!admin.membershipIntent||admin.reverifyOpen">授权</button><button class="danger" type="button" :disabled="!admin.accessEnabled.members||admin.membershipBusy||!!admin.membershipIntent||admin.reverifyOpen" @click="membership(false)">撤销</button>
      </form>
      <p class="admin-note">账号选择只包含已加载的用户记录。</p>
      <div class="admin-row-actions"><button v-if="admin.userFilter!=='ALL'" type="button" @click="admin.filterUsers('ALL')">加载全部角色的账号</button><button v-if="admin.pageCursors.users" type="button" :disabled="admin.pageBusy.has('users')" @click="admin.loadMoreRecords('users')">加载更多账号</button></div>
      <p v-if="localError" role="alert">{{ localError }}</p>
      <div class="admin-chip-list"><span v-for="member in members" :key="`${member.userId}-${member.channel}`">{{ member.username }} · {{ member.channel }} · {{ member.enabled?'已授权':'已撤销' }}</span></div>
      <p v-if="!admin.accessEnabled.members" role="status">版本化成员管理未启用，授权状态只读。</p>
      <button v-if="admin.accessCursors.members" type="button" :disabled="admin.accessBusy.has('members')" @click="admin.loadMoreAccess('members')">加载更多成员</button>
      <div class="admin-list">
        <article v-for="release in releases" :key="release.id">
          <div><strong>{{ release.version }} · {{ release.channel }}</strong><span>{{ release.status }} · {{ release.rolloutPercentage }}% · {{ release.releaseNotes||'无发布说明' }}</span><small v-if="release.status==='WITHDRAWN'">已撤回，不可再次发布</small></div>
          <div class="admin-row-actions">
            <button v-for="action in actions" :key="action.label" :class="{danger:action.status==='WITHDRAWN'}" type="button" :disabled="!allowed(release,action.status)" @click="policy($event,release,action.status,action.percentage)">{{ action.label }}</button>
          </div>
        </article>
        <p v-if="!releases.length" class="admin-empty">暂无已导入制品；管理页不提供文件上传。</p>
      </div>
      <button v-if="admin.releaseCursor" type="button" :disabled="admin.releaseMoreBusy" @click="admin.loadMoreReleases()">{{ admin.releaseMoreBusy?'加载中…':'加载更多发布版本' }}</button>
    </template>
  </section>
</template>
<script setup lang="ts">
import { nextTick, ref,watch } from 'vue';
import type { ClientRelease } from '@studyroom/contracts';
import type { AdminUser } from '../../services/admin';
import { useAdminStore } from '../../stores/admin';
import AdminState from './AdminState.vue';
defineProps<{releases:ClientRelease[];members:any[];users:AdminUser[];loading:boolean;error?:string}>();
const emit=defineEmits<{retry:[];membership:[userId:string|number,channel:string,enabled:boolean,reason:string];policy:[release:ClientRelease,patch:any]}>();
const admin=useAdminStore(),channels=['stable','beta','provider-experimental'];
const userId=ref<string|number>(0),channel=ref('stable'),reason=ref(''),localError=ref(''),confirmation=ref<HTMLElement|null>(null);
let trigger:HTMLElement|null=null;
const memberConfirmation=ref<HTMLElement|null>(null);let memberTrigger:HTMLElement|null=null;
watch(()=>admin.membershipIntent,async(value,old)=>{if(value&&!old){memberTrigger=document.activeElement as HTMLElement;await nextTick();memberConfirmation.value?.focus();}});
async function cancelMember(){admin.cancelMembership();await nextTick();if(memberTrigger?.isConnected)memberTrigger.focus();}
const actions:{label:string;status:ClientRelease['status'];percentage:number}[]=[{label:'试投放',status:'PILOT',percentage:0},{label:'10%',status:'ROLLING',percentage:10},{label:'30%',status:'ROLLING',percentage:30},{label:'50%',status:'ROLLING',percentage:50},{label:'全量',status:'FULL',percentage:100},{label:'暂停',status:'PAUSED',percentage:0},{label:'撤回',status:'WITHDRAWN',percentage:0}];
function allowed(release:ClientRelease,status:ClientRelease['status']) {
  if(!admin.releasePolicyEnabled || release.policyVersion==null || release.status==='WITHDRAWN' || admin.releaseIntent)return false;
  return status===release.status || status==='PAUSED' || status==='WITHDRAWN' || release.status==='DRAFT'&&status==='PILOT' || ['PILOT','ROLLING','PAUSED'].includes(release.status)&&['PILOT','ROLLING','FULL'].includes(status) && !(release.status==='ROLLING'&&status==='PILOT');
}
function membership(enabled:boolean){if(userId.value&&reason.value)emit('membership',userId.value,channel.value,enabled,reason.value);else localError.value='请选择账号并填写审计原因。';}
async function policy(event:Event,release:ClientRelease,status:ClientRelease['status'],rolloutPercentage:number){
  if(!reason.value){localError.value='请先填写审计原因，再选择发布操作。';return;}
  localError.value='';trigger=event.currentTarget as HTMLElement;
  emit('policy',release,{status,rolloutPercentage,reason:reason.value});await nextTick();confirmation.value?.focus();
}
async function cancel(){admin.cancelRelease();await nextTick();if(trigger?.isConnected)trigger.focus();}
</script>
<style scoped>
.release-confirm{padding:20px;margin-block:16px;border-radius:18px;outline-offset:4px;overflow-wrap:anywhere}
.release-confirm h2{font-size:18px;margin:0 0 12px}.release-confirm p{margin:8px 0;line-height:1.6}
.release-confirm .admin-row-actions{margin-top:16px;flex-wrap:wrap}.admin-list small{display:block;margin-top:6px;opacity:.8}
</style>
