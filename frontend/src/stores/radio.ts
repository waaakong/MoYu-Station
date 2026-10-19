import type { RadioNowPlaying, RadioStation } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { listRadioStations, refreshRadioNowPlaying } from "../services/radio";

export const RADIO_RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

export const useRadioStore = defineStore("radio", {
  state: () => ({ stations: [] as RadioStation[], nowPlaying: {} as Record<string, RadioNowPlaying>, loading: false, error: "" }),
  actions: {
    async load() {
      if (this.stations.length || this.loading) return;
      this.loading = true;
      this.error = "";
      try { this.stations = await listRadioStations(); }
      catch (error) { this.error = error instanceof Error ? error.message : "RADIO_UNAVAILABLE"; }
      finally { this.loading = false; }
    },
    async refresh(stationId: string) {
      const value = await refreshRadioNowPlaying(stationId).catch(() => undefined);
      if (value) this.nowPlaying[stationId] = value;
    }
  }
});
