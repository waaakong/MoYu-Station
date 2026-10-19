import type { StudyRoomDesktopBridge } from "@studyroom/contracts";

declare global {
  interface Window {
    studyRoomDesktop: StudyRoomDesktopBridge;
  }
}

export {};
