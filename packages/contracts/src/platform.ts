export type PlatformKind = "web" | "electron";

export interface RuntimeCapabilities {
  platform: PlatformKind;
  localLibrary: boolean;
  persistentQueue: boolean;
  secureCredentials: boolean;
  mediaKeys: boolean;
  systemTray: boolean;
  autoUpdate: boolean;
  localFocusDatabase: boolean;
  temporaryFilePlayback: boolean;
  publicRadio: boolean;
  providerLogin: boolean;
  providerPlayback: boolean;
  /** Native notification bridge exists; actual OS support/permission is checked per delivery. */
  systemNotifications?: boolean;
}

export const WEB_CAPABILITIES: RuntimeCapabilities = Object.freeze({
  platform: "web",
  systemNotifications: false,
  localLibrary: false,
  persistentQueue: false,
  secureCredentials: false,
  mediaKeys: false,
  systemTray: false,
  autoUpdate: false,
  localFocusDatabase: false,
  temporaryFilePlayback: true,
  publicRadio: true,
  providerLogin: false,
  providerPlayback: false
});

export const ELECTRON_CAPABILITIES: RuntimeCapabilities = Object.freeze({
  platform: "electron",
  systemNotifications: true,
  localLibrary: true,
  persistentQueue: true,
  secureCredentials: true,
  mediaKeys: true,
  systemTray: true,
  autoUpdate: true,
  localFocusDatabase: true,
  temporaryFilePlayback: false,
  publicRadio: true,
  providerLogin: true,
  providerPlayback: true
});
