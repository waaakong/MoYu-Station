export const APP_NAV_TOP = 30;
export const APP_NAV_RIGHT = 46;
export const APP_NAV_HEIGHT = 53;
export const APP_NAV_MODULE_GAP = 36;

export function scaledNavModuleTop(scale = 1) {
  return APP_NAV_TOP + APP_NAV_HEIGHT + APP_NAV_MODULE_GAP * Number(scale || 1);
}

export function measureAppViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}
