import { http } from "./http";
import { checkAccessPage } from './admin';

function unwrap(response) {
  return response?.data?.data ?? response?.data;
}

function checkedRelease(value) {
  if (!value || typeof value.id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value.id)
      || !['DRAFT','PILOT','ROLLING','FULL','PAUSED','WITHDRAWN'].includes(value.status)
      || (value.policyVersion !== null && (typeof value.policyVersion !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value.policyVersion)))) {
    throw new Error('发布结果格式不完整，请核对服务端原版本。');
  }
  return value;
}

export async function fetchUpdateMembers() {
  const data = unwrap(await http.get("/admin/client-updates/members"));
  return Array.isArray(data) ? data : [];
}

export async function fetchMemberPage(cursor,guard){const value=unwrap(await http.get(`/admin/client-updates/members/page${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{mediaGuard:guard}));checkAccessPage(value);value.items.forEach(checkedMember);return value;}
function checkedMember(value){if(!value||typeof value.userId!=='string'||!/^[1-9][0-9]{0,18}$/.test(value.userId)||typeof value.enabled!=='boolean'||!['stable','beta','provider-experimental'].includes(value.channel)||value.adminVersion!==null&&(typeof value.adminVersion!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value.adminVersion)))throw new Error('成员结果格式不完整。');return value;}
export async function fetchUpdateMember(userId,channel,guard){const value=checkedMember(unwrap(await http.get(`/admin/client-updates/members/${userId}?channel=${encodeURIComponent(channel)}`,{mediaGuard:guard})));if(value.userId!==String(userId)||value.channel!==channel)throw new Error('成员结果目标不一致。');return value;}
export async function setUpdateMember(member, enabled, reason,guard) {
  const value=checkedMember(unwrap(await http.put(`/admin/client-updates/members/${member.userId}`, { channel:member.channel, enabled, reason,expectedVersion:member.adminVersion },{mediaGuard:guard})));
  if(value.userId!==member.userId||value.channel!==member.channel||value.enabled!==enabled)throw new Error('成员修改结果未确认，请核对固定账号及通道。');return value;
}

export async function fetchClientReleases() {
  const data = unwrap(await http.get("/admin/client-updates/releases"));
  return Array.isArray(data) ? data : [];
}

export async function fetchReleasePage(cursor, guard) {
  const data = unwrap(await http.get(`/admin/client-updates/releases/page${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {mediaGuard:guard}));
  if (!Array.isArray(data?.items) || typeof data.versionedPolicyEnabled !== 'boolean') throw new Error('当前服务不支持安全发布管理，请升级后端后再操作。');
  data.items.forEach(checkedRelease);
  if(data.nextCursor!==null && (typeof data.nextCursor!=='string' || !/^[A-Za-z0-9_-]{1,160}$/.test(data.nextCursor)))throw new Error('发布列表游标无效，请刷新。');
  return data;
}

export async function fetchClientRelease(id, guard) {
  const value=checkedRelease(unwrap(await http.get(`/admin/client-updates/releases/${id}`, {mediaGuard:guard})));
  if(value.id!==String(id))throw new Error('发布结果目标不一致，请重新核对。');
  return value;
}

export async function updateClientRelease(release, patch, guard) {
  const value=checkedRelease(unwrap(await http.patch(`/admin/client-updates/releases/${release.id}`, {
    status: patch.status ?? release.status,
    rolloutPercentage: patch.rolloutPercentage ?? release.rolloutPercentage,
    mandatory: patch.mandatory ?? release.mandatory,
    minimumSupportedVersion: patch.minimumSupportedVersion ?? release.minimumSupportedVersion,
    releaseNotes: patch.releaseNotes ?? release.releaseNotes,
    reason: patch.reason,
    expectedVersion: release.policyVersion
  }, {mediaGuard:guard})));
  if(value.id!==String(release.id) || value.policyVersion!==String(BigInt(release.policyVersion)+1n))throw new Error('发布结果未确认，请核对原版本。');
  return value;
}
