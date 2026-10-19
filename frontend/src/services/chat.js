import { http } from "./http";
import {acquireChatChannel} from '../chat/sharedChannel';
import {useAuthStore} from '../stores/auth';

export async function fetchOnlineUsers() {
  const { data } = await http.get("/chat/online-users");
  return data?.data || [];
}

export async function fetchChatCapabilities() {
  const { data } = await http.get('/chat/capabilities');
  return data?.data || {};
}

export async function fetchConversations(cursor) {
  const { data } = await http.get('/chat/conversations', { params: cursor ? { cursor } : {} });
  if (!Array.isArray(data?.data?.items)) throw new Error('会话列表响应无效，请稍后重试。');
  return data.data;
}

export async function fetchHallMessages(afterId, beforeId) {
  const { data } = await http.get("/chat/hall/messages", { params: { ...(afterId ? { afterId } : {}), ...(beforeId ? { beforeId } : {}) } });
  return data?.data || [];
}

export async function fetchPrivateMessages(userId, afterId, beforeId) {
  const { data } = await http.get(`/chat/private/${userId}/messages`, { params: { ...(afterId ? { afterId } : {}), ...(beforeId ? { beforeId } : {}) } });
  return data?.data || [];
}

export async function markPrivateRead(userId, throughId) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(throughId))) throw new Error('已读位置无效');
  await http.post(`/chat/private/${userId}/read`, { throughId:String(throughId) });
}

export async function deletePrivateMessages(userId,throughId) {
  await http.delete(`/chat/private/${userId}/messages`,throughId?{data:{throughId:String(throughId)}}:{});
}
export async function deletePrivateMessage(messageId){const{data}=await http.delete(`/chat/private/messages/${messageId}`);if(data?.data?.messageId!==String(messageId)||data?.data?.status!=='deleted')throw new Error('删除结果未确认');}
export async function fetchPrivateVisibility(peer,ids){const{data}=await http.get(`/chat/private/${peer}/messages/visibility`,{params:{ids:ids.join(',')}});if(!Array.isArray(data?.data?.visibleIds))throw new Error('消息可见性核对失败');return data.data.visibleIds;}

export async function recallPrivateMessage(messageId) {
  const { data } = await http.post(`/chat/private/messages/${messageId}/recall`);
  return data?.data || null;
}

export async function fetchPrivateUnread() {
  const { data } = await http.get("/chat/private/unread");
  return data?.data || [];
}

export async function uploadChatImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await http.post("/chat/images", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data?.data?.url || "";
}

export async function updateChatStatus(onlineStatus) {
  await http.patch("/chat/status", { onlineStatus });
}

export function createChatSocket({ onMessage, onOpen, onStateChange } = {}) {
  const auth=useAuthStore();
  return acquireChatChannel(`${auth.sessionGeneration}:${auth.user?.id||'guest'}`,{onMessage,onOpen,onStateChange});
}
