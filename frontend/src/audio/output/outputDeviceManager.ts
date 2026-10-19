import type { OutputDeviceSummary } from "@studyroom/contracts";

interface SinkSelectableAudioContext extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

export interface OutputDeviceManagerOptions {
  mediaDevices?: MediaDevices;
  onFallback?: () => void;
}

export class OutputDeviceManager {
  private readonly mediaDevices?: MediaDevices;
  private readonly onFallback?: () => void;
  private selectedId = "default";
  private removeDeviceListener?: () => void;

  constructor(private readonly context: AudioContext, options: OutputDeviceManagerOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    this.onFallback = options.onFallback;
  }

  supported(): boolean {
    return typeof (this.context as SinkSelectableAudioContext).setSinkId === "function"
      && typeof this.mediaDevices?.enumerateDevices === "function";
  }

  async list(): Promise<OutputDeviceSummary[]> {
    if (!this.supported() || !this.mediaDevices) return [];
    const devices = (await this.mediaDevices.enumerateDevices()).filter(({ kind }) => kind === "audiooutput");
    return devices.map((device, index) => ({
      id: device.deviceId || "default",
      label: device.label || `音频输出 ${index + 1}`,
      isDefault: !device.deviceId || device.deviceId === "default"
    }));
  }

  async select(deviceId: string): Promise<string> {
    if (!this.supported()) throw new Error("OUTPUT_DEVICE_UNAVAILABLE");
    const setSinkId = (this.context as SinkSelectableAudioContext).setSinkId;
    if (!setSinkId) throw new Error("OUTPUT_DEVICE_UNAVAILABLE");
    try {
      await setSinkId.call(this.context, deviceId === "default" ? "" : deviceId);
      this.selectedId = deviceId;
      return deviceId;
    } catch {
      await this.fallbackToDefault(setSinkId);
      throw new Error("OUTPUT_DEVICE_SWITCH_FAILED");
    }
  }

  watch(): () => void {
    if (!this.mediaDevices || this.removeDeviceListener) return this.removeDeviceListener ?? (() => undefined);
    const listener = () => void this.ensureSelectedDeviceExists();
    this.mediaDevices.addEventListener("devicechange", listener);
    this.removeDeviceListener = () => {
      this.mediaDevices?.removeEventListener("devicechange", listener);
      this.removeDeviceListener = undefined;
    };
    return this.removeDeviceListener;
  }

  dispose(): void {
    this.removeDeviceListener?.();
  }

  private async ensureSelectedDeviceExists(): Promise<void> {
    if (this.selectedId === "default") return;
    try {
      const devices = await this.list();
      if (!devices.some(({ id }) => id === this.selectedId)) {
        const setSinkId = (this.context as SinkSelectableAudioContext).setSinkId;
        if (setSinkId) await this.fallbackToDefault(setSinkId);
      }
    } catch {
      // Enumeration failures do not change a working route.
    }
  }

  private async fallbackToDefault(setSinkId: NonNullable<SinkSelectableAudioContext["setSinkId"]>): Promise<void> {
    try { await setSinkId.call(this.context, ""); } catch { /* the OS remains authoritative */ }
    this.selectedId = "default";
    this.onFallback?.();
  }
}
