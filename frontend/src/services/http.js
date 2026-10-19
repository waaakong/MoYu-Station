import axios from "axios";
import { assertExactEntityIds } from './entityBoundary';
import { desktopCloudAdapter } from "./desktopCloud";
import { desktopApiBaseUrl } from "../config/cloudEndpoint";

export const ACCOUNT_LOGGED_IN_ELSEWHERE_CODE = "ACCOUNT_LOGGED_IN_ELSEWHERE";
export const AUTH_REQUIRED_CODES = new Set(["AUTH_REQUIRED", "AUTH_SESSION_EXPIRED"]);
export const AUTH_BANNED_CODE = "AUTH_ACCOUNT_BANNED";
export const AUTH_CSRF_INVALID_CODE = "AUTH_CSRF_INVALID";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const apiBaseUrl = typeof window !== "undefined" && window.studyRoomDesktop
  ? desktopApiBaseUrl()
  : import.meta.env.VITE_API_BASE_URL || "/api";

export const http = axios.create({
  ...(typeof window !== "undefined" && window.studyRoomDesktop?.cloud ? { adapter: desktopCloudAdapter } : {}),
  baseURL: apiBaseUrl,
  timeout: 12000,
  withCredentials: true
});

const csrfClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 12000,
  withCredentials: true
});

let csrfToken = "";
let csrfRequest = null;
let csrfGeneration = 0;

export class ApiError extends Error {
  constructor(message, { code = "", status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function invalidateCsrfToken() {
  csrfGeneration++;
  csrfToken = "";
  csrfRequest = null;
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    const generation = csrfGeneration;
    const pending = csrfClient.get("/auth/csrf")
      .then((response) => {
        if (generation !== csrfGeneration) throw new ApiError("安全会话已变化，请重新操作。", { code: "AUTH_CSRF_STALE" });
        if (response.data?.success === false) {
          handleAuthCode(response.data.code || "");
          throw toApiError(response.data, "无法建立安全会话，请刷新后重试。");
        }
        const token = response.data?.data?.token;
        if (typeof token !== "string" || !token) {
          throw new ApiError("无法建立安全会话，请刷新后重试。", { code: "AUTH_CSRF_UNAVAILABLE" });
        }
        csrfToken = token;
        return token;
      })
      .catch((error) => {
        if (generation !== csrfGeneration) throw new ApiError("安全会话已变化，请重新操作。", { code: "AUTH_CSRF_STALE" });
        if (error instanceof ApiError) throw error;
        const body = error?.response?.data;
        const code = body?.code || "";
        handleAuthCode(code);
        throw new ApiError(body?.message || getRequestFallbackMessage(error), {
          code,
          status: Number(error?.response?.status || 0),
          retryAfter: getRetryAfter(error)
        });
      })
      .finally(() => {
        if (csrfRequest === pending) csrfRequest = null;
      });
    csrfRequest = pending;
  }
  return csrfRequest;
}

function toApiError(body, fallbackMessage) {
  return new ApiError(body?.message || fallbackMessage || "请求失败", {
    code: body?.code || ""
  });
}

function getRequestFallbackMessage(error) {
  const status = error?.response?.status;
  if (status === 403) {
    return "当前节点访问被拒绝，请检查内网穿透或稍后重试";
  }
  if (!error?.response) {
    return "服务暂时不可用，请确认前后端已启动";
  }
  return error?.message || "请求失败";
}

function getRetryAfter(error) {
  const value = Number.parseInt(String(error?.response?.headers?.["retry-after"] || "0"), 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function notifyLoggedInElsewhere() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("studyroom:logged-in-elsewhere"));
  }
}

function notifyAuthState(code) {
  if (typeof window === "undefined") return;
  if (AUTH_REQUIRED_CODES.has(code)) {
    window.dispatchEvent(new CustomEvent("studyroom:session-ended", { detail: { code } }));
  } else if (code === AUTH_BANNED_CODE) {
    window.dispatchEvent(new CustomEvent("studyroom:account-banned", { detail: { code } }));
  }
}

function handleAuthCode(code) {
  if (code === ACCOUNT_LOGGED_IN_ELSEWHERE_CODE) notifyLoggedInElsewhere();
  if (code === AUTH_CSRF_INVALID_CODE || AUTH_REQUIRED_CODES.has(code)) invalidateCsrfToken();
  notifyAuthState(code);
}

http.interceptors.request.use(async (config) => {
  config.mediaGuard?.();
  if (typeof window !== "undefined" && window.studyRoomDesktop?.cloud) return config;
  const method = String(config.method || "GET").toUpperCase();
  if (!WRITE_METHODS.has(method)) return config;
  const token = await ensureCsrfToken();
  config.mediaGuard?.();
  if (typeof config.headers?.set === "function") {
    config.headers.set("X-CSRF-Token", token);
  } else {
    config.headers = { ...(config.headers || {}), "X-CSRF-Token": token };
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    response.config?.mediaGuard?.();
    const body = response.data;
    if (body && typeof body === "object" && body.success === false) {
      handleAuthCode(body.code || "");
      return Promise.reject(toApiError(body, "请求失败"));
    }
    try { assertExactEntityIds(response.data); }
    catch { throw new ApiError('服务返回的记录标识无法精确识别，请更新服务后重试。', { code: 'ENTITY_ID_INVALID' }); }
    return response;
  },
  (error) => {
    (error?.config || error?.response?.config)?.mediaGuard?.();
    if (axios.isCancel(error) || error?.name === "AbortError") return Promise.reject(error);
    if (error instanceof ApiError) return Promise.reject(error);
    const body = error?.response?.data;
    const code = body?.code || "";
    handleAuthCode(code);
    return Promise.reject(new ApiError(body?.message || getRequestFallbackMessage(error), {
      code,
      status: Number(error?.response?.status || 0),
      retryAfter: getRetryAfter(error)
    }));
  }
);
