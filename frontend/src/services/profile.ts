import { http } from "./http";
import type { UserProfile } from "./auth";
import { reliableCreate, feedbackDraft } from './reliableCreate';

interface ApiEnvelope<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

export interface ProfileDetails extends UserProfile {
  level?: number;
  exp?: number;
  currentLevelExp?: number;
  nextLevelExp?: number;
  levelProgress?: number;
  createdAt?: string;
  privacy?: string;
}

export interface ProfileStats {
  fishTimingBasis?:'LEGACY_IDLE'|'RELAX_PAGE';
  fakeEffortIndex?:number|null;
  coverage?:'CONFIRMED'|'PARTIAL'|'UNAVAILABLE';
  todayFocusMinutes?: number | null;
  streakDays?: number;
  favoriteScene?: string | null;
  totalFocusHours?: number;
  fishMinutes?: number | null;
  onlineMinutes?: number | null;
}

export interface ProfileCalendarDay {
  fishTimingBasis?:'LEGACY_IDLE'|'RELAX_PAGE';
  onlineMinutes?:number|null;
  fishMinutes?:number|null;
  fakeEffortIndex?:number|null;
  coverage?:string;
  date: string;
  focusMinutes: number | null;
  status: "EMPTY" | "FOCUS" | "FISH" | string;
}

export interface ProfilePost {
  id: string | number;
  content: string;
  sceneName?: string;
  likeCount?: number;
  commentCount?: number;
  createdAt?: string;
}

export interface ShareCard {
  fishTimingBasis?:'LEGACY_IDLE'|'RELAX_PAGE';
  coverage?:string;
  statDate?: string;
  timeZone?: string;
  fakeEffortIndex?: number | null;
  title?: string;
  focusMinutes?: number | null;
  fishMinutes?: number | null;
  favoriteScene?: string;
  quote?: string;
}

export interface FeedbackPayload {
  title: string;
  content: string;
  feedbackType: string;
}

function unwrap<T>(response: { data: ApiEnvelope<T> }): T {
  return response.data.data;
}

export async function fetchProfile(): Promise<ProfileDetails> {
  return unwrap(await http.get<ApiEnvelope<ProfileDetails>>("/profile/me"));
}

export async function fetchProfileStats(): Promise<ProfileStats> {
  return unwrap(await http.get<ApiEnvelope<ProfileStats>>("/profile/stats"));
}

export async function fetchProfilePosts(): Promise<ProfilePost[]> {
  return unwrap(await http.get<ApiEnvelope<ProfilePost[]>>("/profile/posts")) || [];
}

export async function fetchProfileCalendar(month?: string): Promise<ProfileCalendarDay[]> {
  return unwrap(await http.get<ApiEnvelope<ProfileCalendarDay[]>>("/profile/calendar", {
    params: month ? { month } : undefined
  })) || [];
}

export async function fetchShareCard(date?:string): Promise<ShareCard> {
  return unwrap(await http.get<ApiEnvelope<ShareCard>>("/profile/share-card",{params:date?{date}:undefined}));
}

export async function fetchProfileOverview() {
  const [profile, stats, posts, calendar, shareCard] = await Promise.all([
    fetchProfile(), fetchProfileStats(), fetchProfilePosts(), fetchProfileCalendar(), fetchShareCard()
  ]);
  return { profile, stats, posts, calendar, shareCard };
}

export async function deleteOwnPost(postId: string | number): Promise<void> {
  await http.delete(`/profile/posts/${postId}`);
}

export async function submitFeedback(payload: FeedbackPayload): Promise<{id:string|number}> {
  const result=await reliableCreate({slot:'feedback',kind:'FEEDBACK',url:'/profile/feedback',payload:{...payload},recover:async id=>({id})});
  if(feedbackDraft.title===payload.title && feedbackDraft.content===payload.content)Object.assign(feedbackDraft,{title:'',content:''});
  return result;
}

export async function updateNickname(nickname: string): Promise<ProfileDetails> {
  return unwrap(await http.post<ApiEnvelope<ProfileDetails>>("/profile/nickname", { nickname }));
}

export async function uploadAvatar(file: File): Promise<ProfileDetails> {
  const formData = new FormData();
  formData.append("file", file);
  return unwrap(await http.post<ApiEnvelope<ProfileDetails>>("/profile/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  }));
}

export async function updateOwnPassword(payload: { oldPassword: string; newPassword: string }): Promise<void> {
  await http.post("/profile/password", payload);
}
