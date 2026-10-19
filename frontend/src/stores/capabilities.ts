import { defineStore } from "pinia";
import { currentCapabilities } from "../platform/capabilities";

export const useCapabilitiesStore = defineStore("capabilities", {
  state: () => ({ capabilities: currentCapabilities(), loaded: false }),
  actions: {
    async load() {
      if (this.loaded) return;
      if (window.studyRoomDesktop) {
        try {
          this.capabilities = await window.studyRoomDesktop.getCapabilities();
        } catch {
          this.capabilities = currentCapabilities();
        }
      }
      this.loaded = true;
    }
  }
});
