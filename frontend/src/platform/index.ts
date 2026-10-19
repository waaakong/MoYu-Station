import { createElectronAdapter } from "./electronAdapter";
import { webAdapter } from "./webAdapter";

export function getPlatformAdapter() {
  if (typeof window !== "undefined" && window.studyRoomDesktop) {
    return createElectronAdapter(window.studyRoomDesktop);
  }
  return webAdapter;
}
