import type { Rectangle } from "electron";

/** Electron coordinates are DIP. Keep the whole restored window and titlebar reachable. */
export function fitWindowBounds(saved: Rectangle | undefined, areas: Rectangle[]): Rectangle {
  const workAreas = areas.filter(a => a.width > 0 && a.height > 0);
  const fallback = workAreas[0] ?? { x: 0, y: 0, width: 1440, height: 900 };
  const valid = saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)
    && saved.width > 0 && saved.height > 0 && saved.width <= 10000 && saved.height <= 10000;
  const source = valid ? saved : undefined;
  const overlap = (a: Rectangle) => source
    ? Math.max(0, Math.min(source.x + source.width, a.x + a.width) - Math.max(source.x, a.x))
      * Math.max(0, Math.min(source.y + source.height, a.y + a.height) - Math.max(source.y, a.y)) : 0;
  const area = [...workAreas].sort((a, b) => overlap(b) - overlap(a))[0] ?? fallback;
  const width = Math.min(area.width, Math.max(Math.min(1080, area.width), source?.width ?? 1440));
  const height = Math.min(area.height, Math.max(Math.min(640, area.height), source?.height ?? 900));
  return {
    width, height,
    x: Math.round(Math.min(area.x + area.width - width, Math.max(area.x, source?.x ?? area.x + (area.width - width) / 2))),
    y: Math.round(Math.min(area.y + area.height - height, Math.max(area.y, source?.y ?? area.y + (area.height - height) / 2)))
  };
}
