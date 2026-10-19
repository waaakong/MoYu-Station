import { http } from "./http";
import { RealtimeConnection, websocketUrl } from "../realtime/realtimeConnection";
import { assertExactEntityIds } from './entityBoundary';
import { useAuthStore } from '../stores/auth';
import { reliableCreate } from './reliableCreate';
import { feedSession, touchFeedEntity } from '../feed/session';

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

function guarded() {
  const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
  const guard=()=>{if(!owner || owner!==auth.user?.id || generation!==auth.sessionGeneration || auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
  return {guard,config:{mediaGuard:guard}};
}
export async function fetchFeedCapabilities(){return unwrap(await http.get('/feed/capabilities'));}
export async function fetchFeedPost(id){const {guard,config}=guarded();const response=await http.get(`/feed/posts/${id}`,config);guard();return unwrap(response);}
export async function fetchFeedPage(stream,cursor){return unwrap(await http.get('/feed/posts',{params:{stream,...(cursor?{cursor}:{})}}));}
export async function setFeedFollow(userId,following){const {guard,config}=guarded();guard();const response=await http.request({...config,url:`/feed/follows/${userId}`,method:following?'PUT':'DELETE'});guard();return unwrap(response);}
export async function findFeedPublication(id){return unwrap(await http.get(`/feed/publications/${id}`));}

export async function fetchFeedPosts(beforeId) {
  const response = await http.get("/feed/posts", { params: beforeId ? { beforeId } : {} });
  return unwrap(response) || [];
}

export async function fetchFeedNotifications() {
  const response = await http.get("/feed/notifications");
  return unwrap(response) || [];
}

export async function createFeedPost({ content, sceneCode, clientRequestId, images }) {
  const {guard,config}=guarded(); guard();
  const formData = new FormData();
  formData.append("content", content || "");
  formData.append("sceneCode", sceneCode || "default");
  formData.append("clientRequestId", clientRequestId);
  (images || []).forEach((image) => {
    formData.append("images", image);
  });
  const response = await http.post("/feed/posts", formData,config); guard();
  return unwrap(response);
}

export async function deleteFeedPost(id) {
  const {guard,config}=guarded();guard(); const response = await http.delete(`/feed/posts/${id}`,config);guard();
  return unwrap(response);
}

export async function likePost(id) {
  const {guard,config}=guarded();guard(); const response = await http.post(`/feed/posts/${id}/like`,undefined,config);guard();
  return unwrap(response);
}

export async function unlikePost(id) {
  const {guard,config}=guarded();guard(); const response = await http.delete(`/feed/posts/${id}/like`,config);guard();
  return unwrap(response);
}

export async function fetchPostComments(id) {
  const response = await http.get(`/feed/posts/${id}/comments`);
  return unwrap(response) || [];
}

export async function createPostComment(id, payload) {
  const result=await reliableCreate({slot:`comment:${id}`,kind:'COMMENT',url:`/feed/posts/${id}/comments`,payload,
    recover:async target=>(await fetchPostComments(id)).find(item=>String(item.id)===String(target)) || null});
  // Finish in account-session memory even when the page has already unmounted.
  const comments=feedSession.comments[id] || [];
  if(result && !comments.some(item=>String(item.id)===String(result.id))) {
    feedSession.comments[id]=[...comments,result];
    const post=feedSession.entities[id];if(post){post.commentCount=Number(post.commentCount || 0)+1;touchFeedEntity(id);}
  }
  if((feedSession.commentDrafts[id] || '').trim()===payload.content){feedSession.commentDrafts[id]='';delete feedSession.replyTargets[id];}
  return result;
}

export function createNotificationSocket({ onMessage, onOpen, onStateChange } = {}) {
  const connection = new RealtimeConnection({
    url: websocketUrl("/ws/notifications"),
    parse: (data) => { const value = JSON.parse(String(data)); assertExactEntityIds(value); return value; },
    onMessage,
    onOpen,
    onStateChange,
    onProtocolError: () => onMessage?.({ type: "ERROR", payload: { message: "互动通知解析失败。" } })
  });
  connection.start();
  return connection;
}
