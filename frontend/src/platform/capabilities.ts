import {
  ELECTRON_CAPABILITIES,
  WEB_CAPABILITIES,
  type RuntimeCapabilities,
  type StudyRoomDesktopBridge
} from "@studyroom/contracts";

export function resolveCapabilities(bridge?: StudyRoomDesktopBridge): RuntimeCapabilities {
  return bridge ? ELECTRON_CAPABILITIES : WEB_CAPABILITIES;
}

export function currentCapabilities(): RuntimeCapabilities {
  return resolveCapabilities(typeof window === "undefined" ? undefined : window.studyRoomDesktop);
}
