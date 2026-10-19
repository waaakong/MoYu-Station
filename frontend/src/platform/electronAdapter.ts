import type { StudyRoomDesktopBridge } from "@studyroom/contracts";

export function createElectronAdapter(bridge: StudyRoomDesktopBridge) {
  return Object.freeze({
    kind: "electron" as const,
    getCapabilities: () => bridge.getCapabilities(),
    openExternal: (url: string) => bridge.openExternal(url),
    selectMusicDirectory: () => bridge.selectMusicDirectory()
  });
}
