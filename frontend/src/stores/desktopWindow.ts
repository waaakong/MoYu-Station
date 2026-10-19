import { defineStore } from "pinia";
import type { DesktopWindowState, WindowCloseBehavior } from "@studyroom/contracts";
export const useDesktopWindowStore = defineStore("desktop-window", {
  state: () => ({ snapshot: null as DesktopWindowState | null, error: "", pending: false }),
  actions: {
    accept(value: DesktopWindowState) {
      if (!this.snapshot || value.revision >= this.snapshot.revision) this.snapshot = value;
    },
    async refresh() {
      if (window.studyRoomDesktop?.readWindowState) this.accept(await window.studyRoomDesktop.readWindowState());
    },
    async setBehavior(behavior: WindowCloseBehavior) {
      if (!window.studyRoomDesktop || this.pending) return;
      this.pending = true; this.error = "";
      try { this.accept(await window.studyRoomDesktop.setWindowCloseBehavior(behavior)); }
      catch { this.error = "关闭偏好未保存，请重试。"; }
      finally { this.pending = false; }
    }
  }
});
