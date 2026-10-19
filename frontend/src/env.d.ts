/// <reference types="vite/client" />

import type { StudyRoomDesktopBridge } from "@studyroom/contracts";

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DESKTOP_CLOUD_ORIGIN?: string;
  readonly VITE_FEATURE_DESKTOP_SHELL?: string;
  readonly VITE_FEATURE_SOUND_CENTER?: string;
  readonly VITE_FEATURE_LOCAL_LIBRARY?: string;
  readonly VITE_FEATURE_PUBLIC_RADIO?: string;
  readonly VITE_FEATURE_PROVIDER_NETEASE?: string;
  readonly VITE_FEATURE_PROVIDER_QQ_MUSIC?: string;
  readonly VITE_FEATURE_PROVIDER_KUGOU?: string;
  readonly VITE_FEATURE_WEB_RADIO_RELAY?: string;
  readonly VITE_FEATURE_PROVIDERS?: string;
  readonly VITE_FEATURE_ENTERTAINMENT?: string;
  readonly VITE_FEATURE_V2_PAGES?: string;
  readonly VITE_FEATURE_MEDIA_ASSETS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface WindowEventMap {
    "studyroom:logged-in-elsewhere": CustomEvent<void>;
    "studyroom:session-ended": CustomEvent<{ code: string }>;
    "studyroom:account-banned": CustomEvent<{ code: string }>;
  }

  interface Window {
    studyRoomDesktop?: StudyRoomDesktopBridge;
    moyuStartupOverlay?: import('./startup/runner').StartupSurface;
  }
}

export {};
