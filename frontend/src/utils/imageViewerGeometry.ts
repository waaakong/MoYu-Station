export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export const MAX_IMAGE_SCALE = 4;

export function fitScale(image: Size, viewport: Size): number {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}

export function clampOffset(offset: Point, image: Size, viewport: Size, scale: number): Point {
  const boundX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const boundY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { x: Math.max(-boundX, Math.min(boundX, offset.x)), y: Math.max(-boundY, Math.min(boundY, offset.y)) };
}

// Coordinates relative to stage center; supports both zoom and pinch-center pan.
export function anchoredOffset(offset: Point, oldScale: number, newScale: number, from: Point, to = from): Point {
  const ratio = newScale / oldScale;
  return { x: to.x - (from.x - offset.x) * ratio, y: to.y - (from.y - offset.y) * ratio };
}
