import { http } from "./http";
import { reliableCreate } from './reliableCreate';
import type {AdminPageModule,AdminRecordPage} from '@studyroom/contracts';

interface ApiEnvelope<T> { data?: T }
function unwrap<T>(response: { data?: ApiEnvelope<T> | T }): T {
  const body = response?.data as ApiEnvelope<T> | T | undefined;
  return ((body as ApiEnvelope<T>)?.data ?? body) as T;
}

export type MetricAvailability = "AVAILABLE" | "STALE" | "UNAVAILABLE";
export interface MetricSectionStatus { status: MetricAvailability; sampledAt?: string | null; errorCode?: string | null }
export interface AdminDashboard {
  sampledAt?: string; sections?: Record<string, MetricSectionStatus>;
  onlineUsers?: number; todayPosts?: number; pendingFeedback?: number; systemStatus?: string;
  cpuUsage?: number; jvmMemoryUsage?: number; systemMemoryUsage?: number; apiLatencyMs?: number;
  diskIoUsage?: number | null; diskReadRate?: string; diskWriteRate?: string; networkReceiveRate?: string; networkTransmitRate?: string;
  diskFreeSpace?: string; diskTotalSpace?: string; diskUsage?: number | null; projectSize?: string; gcCount?: number; gcTimeMs?: number;
  activeThreads?: number; peakThreads?: number; dbActiveConnections?: number; dbIdleConnections?: number; dbTotalConnections?: number;
  dbThreadsAwaitingConnection?: number; dbStatus?: string; slowQueryCount?: number; recentSlowQueryCount?: number;
  requestCount?: number; requestsPerMinute?: number; qps?: string; http4xxCount?: number; http5xxCount?: number; httpErrorRate?: number;
  redisHitRate?: number; redisHits?: number; redisMisses?: number; redisLatencyMs?: number; redisStatus?: string; uptime?: string;
}
export interface AdminUser { id: string | number; adminVersion?:string|null; username: string; nickname?: string; userType: string; onlineStatus?: string; todayFocusMinutes?: number }
export interface AdminPost { id: string | number; author: string; content: string; sceneName: string; likeCount: number; commentCount: number; createdAt: string }
export interface AdminFeedback { id: string | number; adminVersion?:string|null; author: string; feedbackType: string; title: string; content: string; status: string; createdAt: string; updatedAt?: string; autoDeleteAt?: string }
export interface Invitation { id: string | number; adminVersion?:string|null; label: string; code?: string; codeHint?: string; status: string; maxUses: number; usedCount: number; expiresAt?: string; createdAt: string }
export interface AuditEntry { id: string | number; actorUserId?: string | number; actionCode: string; targetType: string; targetId: string; result: string; errorCode?: string; reason?: string; createdAt: string }
export interface AuditPage { items: AuditEntry[]; total: number; page: number; size: number }

export async function fetchAdminDashboard(): Promise<AdminDashboard> { return unwrap(await http.get("/admin/dashboard")); }
export async function fetchAdminUsers(): Promise<AdminUser[]> { return unwrap(await http.get("/admin/users")) || []; }
export async function fetchAdminPosts(): Promise<AdminPost[]> { return unwrap(await http.get("/admin/posts")) || []; }
export async function fetchAdminFeedback(): Promise<AdminFeedback[]> {
  const items = unwrap<AdminFeedback[]>(await http.get("/admin/feedback")) || [];
  return items.map((item) => ({ ...item, updatedAt: item.updatedAt || item.createdAt }));
}
export async function fetchInvitations(): Promise<Invitation[]> { return unwrap(await http.get("/admin/invitations")) || []; }
export async function createInvitation(payload: { label: string; maxUses: number; expiresAt?: string }): Promise<Invitation|null> {
  return reliableCreate({slot:'invitation',kind:'INVITATION',url:'/admin/invitations',payload:{...payload},
    recover:async id=>fetchInvitation(id)});
}
export async function fetchInvitation(id:string|number,guard?:()=>void):Promise<Invitation>{const value=unwrap<Invitation>(await http.get(`/admin/invitations/${id}`,{mediaGuard:guard}));if(String(value?.id)!==String(id))throw new Error('邀请码结果目标不一致，请重新核对。');return value;}
export async function fetchInvitationPage(cursor:string|null,guard:()=>void):Promise<AdminRecordPage<Invitation>>{const page=unwrap<AdminRecordPage<Invitation>>(await http.get(`/admin/invitations/page${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{mediaGuard:guard}));checkAccessPage(page);return page;}
export function checkAccessPage(value:AdminRecordPage<unknown>){if(!Array.isArray(value?.items)||typeof value.versionedWrites!=='boolean'||value.nextCursor!==null&&(typeof value.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,192}$/.test(value.nextCursor)))throw new Error('当前服务不支持安全分页管理。');}
export async function disableInvitation(id: string | number,expectedVersion:string,guard:()=>void): Promise<Invitation> { const value=unwrap<Invitation>(await http.post(`/admin/invitations/${id}/disable`,{expectedVersion},{mediaGuard:guard}));if(String(value?.id)!==String(id)||value.status!=='DISABLED')throw new Error('停用结果未确认，请刷新核对原邀请码。');return value; }
export async function fetchAdminAudits(page = 1, size = 30): Promise<AuditPage> { return unwrap(await http.get("/admin/audits", { params: { page, size } })); }
export async function reverifyAdmin(password: string): Promise<{ expiresAt: number }> { return unwrap(await http.post("/admin/reverify", { password })); }
export async function updateAdminUserType(id: string | number, userType: string, expectedVersion?:string|null,guard?:()=>void): Promise<void> { await http.patch(`/admin/users/${id}/type`, { userType,expectedVersion },{mediaGuard:guard}); }
export async function updateAdminUserPassword(id: string | number, password: string, expectedVersion?:string|null,guard?:()=>void): Promise<void> { await http.patch(`/admin/users/${id}/password`, { password,expectedVersion },{mediaGuard:guard}); }
export async function deleteAdminPost(id: string | number, reason = "管理员强制删除",guard?:()=>void): Promise<void> { await http.delete(`/admin/posts/${id}`, { data: { reason },mediaGuard:guard }); }
export async function updateFeedbackStatus(id: string | number, status: string,expectedVersion?:string|null,guard?:()=>void): Promise<void> { await http.patch(`/admin/feedback/${id}/status`, { status,expectedVersion },{mediaGuard:guard}); }
export async function deleteAdminFeedback(id: string | number,expectedVersion?:string|null,guard?:()=>void): Promise<void> { await http.delete(`/admin/feedback/${id}`,{data:{expectedVersion},mediaGuard:guard}); }
export async function fetchAdminPage(module:AdminPageModule,cursor:string|null,role:string,guard:()=>void):Promise<AdminRecordPage<AdminUser|AdminPost|AdminFeedback>>{
  const query=new URLSearchParams();if(cursor)query.set('cursor',cursor);if(module==='users')query.set('role',role);
  const value=unwrap<AdminRecordPage<AdminUser|AdminPost|AdminFeedback>>(await http.get(`/admin/pages/${module}${query.size?'?'+query:''}`,{mediaGuard:guard}));
  if(!Array.isArray(value?.items) || typeof value.versionedWrites!=='boolean' || value.nextCursor!==null && (typeof value.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,192}$/.test(value.nextCursor)))throw new Error('当前服务不支持分页管理，请升级后端后再操作。');
  return value;
}
export function adminDashboardStreamUrl(): string { return `${import.meta.env.VITE_API_BASE_URL || "/api"}/admin/dashboard/stream`; }
