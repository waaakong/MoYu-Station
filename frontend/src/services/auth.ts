import { entityId, type EntityId } from "@studyroom/contracts";
import { http, invalidateCsrfToken } from "./http";

export interface UserProfile {
  id: EntityId;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  userType: string;
  onlineStatus?: string | null;
  banReason?: string | null;
  passwordChangeRequired: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterPayload {
  username: string;
  password: string;
  nickname?: string;
  invitationCode: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

function profileFrom<T extends UserProfile>(response: { data: ApiEnvelope<T> }): T {
  entityId(response.data.data.id);
  return response.data.data;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const response = await http.get<ApiEnvelope<UserProfile | null>>("/auth/me");
  if (response.data.data) entityId(response.data.data.id);
  return response.data.data ?? null;
}

export async function loginAccount(payload: LoginPayload): Promise<UserProfile> {
  const response = await http.post<ApiEnvelope<UserProfile>>("/auth/login", payload);
  invalidateCsrfToken();
  return profileFrom(response);
}

export async function registerAccount(payload: RegisterPayload): Promise<UserProfile> {
  const response = await http.post<ApiEnvelope<UserProfile>>("/auth/register", payload);
  return profileFrom(response);
}

export async function logoutAccount(): Promise<void> {
  try {
    await http.post("/auth/logout");
  } finally {
    invalidateCsrfToken();
  }
}
