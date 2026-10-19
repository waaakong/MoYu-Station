import { defineStore } from "pinia";
import { useAuthStore } from './auth';
import { invitationDraft } from '../services/reliableCreate';
import { ApiError } from "../services/http";
import type { ClientRelease, ClientReleasePolicy, AdminPageModule,AdminAccessModule,AdminUpdateMember } from '@studyroom/contracts';
import { isUnknownWriteOutcome } from '../services/writeOutcome';
import {
  createInvitation, deleteAdminFeedback, deleteAdminPost, disableInvitation, fetchInvitation,fetchInvitationPage,fetchAdminAudits, fetchAdminDashboard,fetchAdminPage,
  fetchAdminFeedback, fetchAdminPosts, fetchAdminUsers, fetchInvitations, reverifyAdmin, updateAdminUserPassword,
  updateAdminUserType, updateFeedbackStatus, type AdminDashboard, type AdminFeedback, type AdminPost, type AdminUser,
  type AuditPage, type Invitation
} from "../services/admin";
import { fetchReleasePage, fetchClientRelease, fetchMemberPage,fetchUpdateMember, setUpdateMember, updateClientRelease } from "../services/clientUpdates";

export type AdminModule = "overview" | "users" | "invitations" | "posts" | "feedback" | "releases" | "audits" | "settings";
type RiskyAction = { label: string; run: () => Promise<void> };
type ReleaseIntent = { original:ClientRelease; patch:ClientReleasePolicy; state:'review'|'unknown'|'conflict'; latest:ClientRelease|null; message:string };

export const useAdminStore = defineStore("admin", {
  state: () => ({
    dashboard: {} as AdminDashboard, users: [] as AdminUser[], invitations: [] as Invitation[], posts: [] as AdminPost[],
    feedback: [] as AdminFeedback[], releases: [] as any[], members: [] as any[], audits: { items: [], total: 0, page: 1, size: 30 } as AuditPage,
    loading: new Set<AdminModule>(), errors: {} as Partial<Record<AdminModule | "action", string>>,
    reverifyOpen: false, reverifyBusy: false, reverifyError: "", pendingAction: null as RiskyAction | null, invitationMessage:''
    ,releaseCursor:null as string|null, releasePolicyEnabled:false, releaseMoreBusy:false, releaseBusy:false,
    releaseIntent:null as ReleaseIntent|null, releaseMessage:'', loadRevisions:{} as Partial<Record<AdminModule,number>>
    ,pageCursors:{users:null,posts:null,feedback:null} as Record<AdminPageModule,string|null>,pageBusy:new Set<AdminPageModule>(),userFilter:'ALL',
    recordBusy:new Set<string>(),recordMessage:'',accessCursors:{invitations:null,members:null} as Record<AdminAccessModule,string|null>,accessBusy:new Set<AdminAccessModule>(),accessEnabled:{invitations:false,members:false},
    membershipBusy:false,membershipIntent:null as {original:AdminUpdateMember;enabled:boolean;reason:string;state:'review'|'unknown'|'conflict';message:string}|null
  }),
  actions: {
    async load(module: AdminModule) {
      const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
      const revision=(this.loadRevisions[module]??0)+1;this.loadRevisions[module]=revision;
      const current=()=>owner===auth.user?.id && generation===auth.sessionGeneration && !auth.authTransition && this.loadRevisions[module]===revision;
      this.loading.add(module); delete this.errors[module];
      try {
        if (module === "overview") {const value=await fetchAdminDashboard();if(current())this.dashboard=value;}
        else if (module === 'users'||module==='posts'||module==='feedback') {
          const guard=()=>{if(!current())throw new DOMException('请求已失效','AbortError');};
          const value=await fetchAdminPage(module,null,this.userFilter,guard);guard();this.pageCursors[module]=value.nextCursor;
          if(module==='users')this.users=value.items as AdminUser[];else if(module==='posts')this.posts=value.items as AdminPost[];else this.feedback=value.items as AdminFeedback[];
        }
        else if (module === "invitations") {const value=await fetchInvitationPage(null,()=>{if(!current())throw new DOMException('请求已失效','AbortError');});if(current()){this.invitations=value.items;this.accessCursors.invitations=value.nextCursor;this.accessEnabled.invitations=value.versionedWrites;}}
        else if (module === "releases") {
          const guard=()=>{if(!current())throw new DOMException('请求已过期','AbortError');};
          const [page,members]=await Promise.all([fetchReleasePage(null,guard), fetchMemberPage(null,guard)]);
          if(current()){this.releases=page.items;this.releaseCursor=page.nextCursor;this.releasePolicyEnabled=page.versionedPolicyEnabled;this.members=members.items;this.accessCursors.members=members.nextCursor;this.accessEnabled.members=members.versionedWrites;}
        }
        else if (module === "audits") {const value=await fetchAdminAudits(this.audits.page,this.audits.size);if(current())this.audits=value;}
      } catch (error) { if(current())this.errors[module] = message(error, "模块加载失败，请稍后重试。"); }
      finally { if(current())this.loading.delete(module); }
    },
    async loadInitial() { await Promise.all([this.load("overview"), this.load("users")]); },
    acceptDashboard(value: AdminDashboard) { this.dashboard = value; delete this.errors.overview; },
    async risky(label: string, run: () => Promise<void>) {
      const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
      const guard=()=>{if(!owner || owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
      const guardedRun=async()=>{guard();await run();guard();};
      delete this.errors.action;
      try { await guardedRun(); }
      catch (error) {
        guard();
        if (error instanceof ApiError && error.code === "ADMIN_REVERIFY_REQUIRED") {
          this.pendingAction = { label, run:guardedRun }; this.reverifyOpen = true; this.reverifyError = ""; return;
        }
        this.errors.action = message(error, `${label}失败。`); throw error;
      }
    },
    cancelReverification() { this.pendingAction = null; this.reverifyOpen = false; this.reverifyError = ""; },
    async confirmReverification(password: string) {
      if (!password || this.reverifyBusy) return;
      const action=this.pendingAction;
      const auth=useAuthStore(),generation=auth.sessionGeneration;
      this.reverifyBusy = true; this.reverifyError = "";
      try {
        await reverifyAdmin(password);
        if(action!==this.pendingAction)return;
        this.pendingAction = null; this.reverifyOpen = false;
        if (action) await action.run();
      } catch (error) { if(generation===auth.sessionGeneration){if(this.reverifyOpen)this.reverifyError=message(error,'身份复验失败，请重试。');else this.errors.action=message(error,'操作结果未确认，请核对后重试。');} }
      finally { if(generation===auth.sessionGeneration)this.reverifyBusy = false; }
    },
    changeUserType(user: AdminUser, userType: string) { const id=user.id,version=user.adminVersion;return this.recordAction('users',String(id),version,`将 ${user.username} 的角色改为 ${userType}`,guard=>updateAdminUserType(id,userType,version,guard)); },
    resetPassword(user: AdminUser, password: string) { const id=user.id,version=user.adminVersion;let secret=password;return this.recordAction('users',String(id),version,`重置 ${user.username} 的密码`,async guard=>{try{await updateAdminUserPassword(id,secret,version,guard);}catch(error){if((error as {code?:string}).code!=='ADMIN_REVERIFY_REQUIRED')secret='';throw error;}secret='';}); },
    removePost(post: AdminPost, reason: string) {const id=post.id;return this.recordAction('posts',String(id),'terminal',`删除动态 ${id}`,guard=>deleteAdminPost(id,reason,guard));},
    changeFeedback(item: AdminFeedback, status: string) {const id=item.id,version=item.adminVersion;return this.recordAction('feedback',String(id),version,`将反馈 ${item.title} 改为 ${status}`,guard=>updateFeedbackStatus(id,status,version,guard));},
    removeFeedback(item: AdminFeedback) {const id=item.id,version=item.adminVersion;return this.recordAction('feedback',String(id),version,`删除反馈 ${item.title}`,guard=>deleteAdminFeedback(id,version,guard));},
    async recordAction(module:AdminPageModule|'invitations',id:string,version:string|null|undefined,label:string,send:(guard:()=>void)=>Promise<unknown>) {
      if(version==null){this.errors.action='版本化管理未启用，请勿使用旧接口绕过校验。';return;}
      const key=module+':'+id;if(this.recordBusy.has(key)||this.reverifyOpen)return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id;
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
      this.recordMessage='';
      await this.risky(label,async()=>{
        guard();this.recordBusy.add(key);
        try{await send(guard);guard();this.recordMessage='操作已保存。';await this.load(module);}
        catch(error){guard();if(isUnknownWriteOutcome(error))throw new Error(`结果未确认：${label}。请先刷新核对当前记录，不会自动再次提交。`);
          if((error as {code?:string}).code==='ADMIN_VERSION_CONFLICT')throw new ApiError(`记录已变化，未覆盖。原操作：${label}。请刷新核对，再明确选择操作。`,{code:'ADMIN_VERSION_CONFLICT'});throw error;
        }finally{if(generation===auth.sessionGeneration)this.recordBusy.delete(key);}
      }).catch(()=>{});
    },
    async filterUsers(role:string){this.userFilter=role;await this.load('users');},
    async loadMoreRecords(module:AdminPageModule){
      const cursor=this.pageCursors[module];if(!cursor || this.pageBusy.has(module)||this.loading.has(module))return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id,revision=this.loadRevisions[module];
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition||revision!==this.loadRevisions[module])throw new DOMException('列表已变化','AbortError');};
      this.pageBusy.add(module);
      try{const page=await fetchAdminPage(module,cursor,this.userFilter,guard);guard();const rows=this[module] as {id:string|number}[],ids=new Set(rows.map(item=>String(item.id)));rows.push(...page.items.filter(item=>!ids.has(String(item.id))));this.pageCursors[module]=page.nextCursor;}
      catch(error){if(generation===auth.sessionGeneration&&revision===this.loadRevisions[module])this.errors.action=message(error,'分页失败，请重试。');}
      finally{if(generation===auth.sessionGeneration)this.pageBusy.delete(module);}
    },
    addInvitation(payload: { label: string; maxUses: number; expiresAt?: string }) {
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id;
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
      this.invitationMessage='';
      return this.risky("创建邀请码", async () => {
        const value=await createInvitation(payload);
        guard();
        if(value && !this.invitations.some(item=>String(item.id)===String(value.id)))this.invitations.unshift(value);
        this.invitationMessage=value?.code?'邀请码已创建，请妥善保存原文。':'已核对：原请求创建成功。原文仅首次返回；未取得原文时，请停用对应邀请码后再创建新码。';
        Object.assign(invitationDraft,{label:'',maxUses:1,expiresAt:''});
        if(value){try{const latest=await fetchInvitation(value.id,guard);guard();const row=this.invitations.find(item=>String(item.id)===String(value.id));if(row)Object.assign(row,latest);}catch{guard();/* Original code remains visible even if metadata refresh fails. */}}
        await this.load('audits');
      }).catch(()=>{});
    },
    revokeInvitation(item: Invitation) {const id=item.id,version=item.adminVersion;return this.recordAction('invitations',String(id),version,`停用邀请码 ${item.label}`,guard=>disableInvitation(id,version!,guard));},
    async loadMoreAccess(module:AdminAccessModule){
      const cursor=this.accessCursors[module],parent=module==='members'?'releases':'invitations';if(!cursor||this.accessBusy.has(module)||this.loading.has(parent))return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id,revision=this.loadRevisions[parent];
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition||revision!==this.loadRevisions[parent])throw new DOMException('列表已变化','AbortError');};
      this.accessBusy.add(module);
      try{const page=module==='members'?await fetchMemberPage(cursor,guard):await fetchInvitationPage(cursor,guard);guard();const rows=this[module];const key=(item:any)=>module==='members'?`${item.userId}:${item.channel}`:String(item.id);const ids=new Set(rows.map(key));rows.push(...page.items.filter((item:any)=>!ids.has(key(item))));this.accessCursors[module]=page.nextCursor;}
      catch(error){if(generation===auth.sessionGeneration&&revision===this.loadRevisions[parent])this.errors.action=message(error,'加载更多失败。');}
      finally{if(generation===auth.sessionGeneration)this.accessBusy.delete(module);}
    },
    async changeMembership(userId: string | number, channel: string, enabled: boolean, reason: string) {
      if(this.membershipBusy||this.membershipIntent||!this.accessEnabled.members)return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id;
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
      this.membershipBusy=true;
      try{const original=await fetchUpdateMember(userId,channel,guard);guard();if(original.adminVersion===null)throw new Error('成员版本化管理未启用。');this.membershipIntent={original,enabled,reason,state:'review',message:''};}
      catch(error){if(generation===auth.sessionGeneration)this.errors.action=message(error,'成员核对失败。');}
      finally{if(generation===auth.sessionGeneration)this.membershipBusy=false;}
    },
    async submitMembership(){
      const intent=this.membershipIntent;if(!intent||intent.state!=='review'||this.membershipBusy)return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id;
      const guard=()=>{if(generation!==auth.sessionGeneration||owner!==auth.user?.id||auth.authTransition||intent!==this.membershipIntent)throw new DOMException('账号会话已结束','AbortError');};
      await this.risky('修改更新成员',async()=>{guard();this.membershipBusy=true;
        try{await setUpdateMember(intent.original,intent.enabled,intent.reason,guard);guard();this.membershipIntent=null;this.releaseMessage='成员授权状态已保存。';await this.load('releases');}
        catch(error){guard();if(isUnknownWriteOutcome(error)){intent.state='unknown';intent.message='提交结果未确认，请先核对原账号和通道；不会自动重发。';}else if((error as {code?:string}).code==='ADMIN_VERSION_CONFLICT'){intent.state='conflict';intent.message='成员状态已变化，未覆盖。原操作与原因已保留，请核对后重新确认。';}throw error;}
        finally{if(generation===auth.sessionGeneration)this.membershipBusy=false;}
      }).catch(()=>{});
    },
    async inspectMembership(){
      const intent=this.membershipIntent;if(!intent||this.membershipBusy)return;
      const auth=useAuthStore(),generation=auth.sessionGeneration;
      const guard=()=>{if(generation!==auth.sessionGeneration||auth.authTransition||this.membershipIntent!==intent)throw new DOMException('操作已失效','AbortError');};
      this.membershipBusy=true;
      try{const latest=await fetchUpdateMember(intent.original.userId,intent.original.channel,guard);guard();intent.original=latest;intent.state='review';intent.message='已读取当前状态。核对账号、通道和原操作后，需再次确认；不会自动提交。';}
      catch(error){if(generation===auth.sessionGeneration)intent.message=message(error,'核对失败。');}
      finally{if(generation===auth.sessionGeneration)this.membershipBusy=false;}
    },
    cancelMembership(){if(!this.membershipBusy){this.membershipIntent=null;this.cancelReverification();}},
    async loadMoreReleases() {
      if(this.releaseMoreBusy || this.loading.has('releases') || !this.releaseCursor)return;
      const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration,revision=this.loadRevisions.releases,cursor=this.releaseCursor;
      const guard=()=>{if(owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition || revision!==this.loadRevisions.releases)throw new DOMException('请求已过期','AbortError');};
      this.releaseMoreBusy=true;
      try {const page=await fetchReleasePage(cursor,guard);guard();const ids=new Set(this.releases.map(item=>String(item.id)));this.releases.push(...page.items.filter((item:ClientRelease)=>!ids.has(String(item.id))));this.releaseCursor=page.nextCursor;}
      catch(error){if(generation===auth.sessionGeneration && revision===this.loadRevisions.releases)this.errors.action=message(error,'加载更多失败，请重试。');}
      finally {if(generation===auth.sessionGeneration)this.releaseMoreBusy=false;}
    },
    changeRelease(release: ClientRelease, patch: ClientReleasePolicy) {
      if(this.releaseIntent || this.releaseBusy)return;
      if(!this.releasePolicyEnabled || release.policyVersion==null || release.status==='WITHDRAWN')return;
      this.releaseMessage='';
      this.releaseIntent={original:structuredClone({...release}),patch:structuredClone({...patch}),state:'review',latest:null,message:''};
    },
    async submitRelease() {
      const intent=this.releaseIntent;if(!intent || this.releaseBusy || intent.state!=='review')return;
      const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
      const guard=()=>{if(owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition || this.releaseIntent!==intent)throw new DOMException('操作已失效','AbortError');};
      const run=async()=>{
        guard();this.releaseBusy=true;
        try {await updateClientRelease(intent.original,intent.patch,guard);guard();this.releaseIntent=null;this.releaseMessage='发布策略已保存。';await this.load('releases');}
        catch(error){guard();if(isUnknownWriteOutcome(error)){intent.state='unknown';intent.message='提交结果未确认，请核对固定版本，不会自动重发。';}
          else if((error as {code?:string}).code==='RELEASE_VERSION_CONFLICT'){intent.state='conflict';intent.message='策略已变化；操作意图已保留，请核对最新策略后重新确认。';}
          else if((error as {code?:string}).code==='RELEASE_WITHDRAWN'){intent.state='conflict';intent.message='该版本已撤回，不能重新发布。';}
          throw error;
        } finally {if(generation===auth.sessionGeneration)this.releaseBusy=false;}
      };
      await this.risky('更新发布策略',run).catch(()=>{});
    },
    async inspectRelease() {
      const intent=this.releaseIntent;if(!intent || this.releaseBusy)return;
      const auth=useAuthStore(),generation=auth.sessionGeneration,owner=auth.user?.id;
      const guard=()=>{if(owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition || this.releaseIntent!==intent)throw new DOMException('操作已失效','AbortError');};
      this.releaseBusy=true;
      try {const latest=await fetchClientRelease(intent.original.id,guard);guard();intent.latest=latest;
        intent.state=latest.policyVersion===intent.original.policyVersion?'review':'conflict';
        intent.message=intent.state==='review'?'服务端版本未变；可以再次明确确认提交，仍使用原版本校验。':'已取得最新策略，请比较后决定是否重新确认；当前状态不证明原请求一定成功。';
      }catch(error){try{guard();intent.message=message(error,'核对失败，请重试。');}catch{/* old account */}}
      finally{if(generation===auth.sessionGeneration)this.releaseBusy=false;}
    },
    rebaseRelease() {
      const intent=this.releaseIntent;if(!intent?.latest || intent.latest.status==='WITHDRAWN' || intent.latest.policyVersion==null || this.releaseBusy)return;
      intent.original={...intent.latest};intent.latest=null;intent.state='review';intent.message='已采用最新版本作为校验基准，请再次确认原操作意图。';
    },
    cancelRelease() {if(!this.releaseBusy){this.releaseIntent=null;this.cancelReverification();}}
  }
});

function message(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
