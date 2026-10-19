import type { QueueItem, RepeatMode } from "@studyroom/contracts";

export function insertAfterCurrent(items: QueueItem[], currentItemId: string | undefined, item: QueueItem): QueueItem[] {
  const withoutDuplicate = items.filter((entry) => entry.id !== item.id);
  const currentIndex = withoutDuplicate.findIndex((entry) => entry.id === currentItemId);
  const target = currentIndex < 0 ? 0 : currentIndex + 1;
  return [...withoutDuplicate.slice(0, target), item, ...withoutDuplicate.slice(target)];
}

export function moveQueueItem(items: QueueItem[], from: number, to: number): QueueItem[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removeQueueItem(items: QueueItem[], itemId: string): QueueItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function nextQueueIndex(
  items: QueueItem[],
  currentIndex: number,
  options: { shuffle: boolean; repeatMode: RepeatMode; random?: () => number; visited?: Set<string> }
): number {
  if (!items.length) return -1;
  if (options.repeatMode === "one" && currentIndex >= 0) return currentIndex;
  if (options.shuffle && items.length > 1) {
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => index !== currentIndex && !options.visited?.has(item.id));
    const pool = candidates.length ? candidates : items.map((item, index) => ({ item, index })).filter(({ index }) => index !== currentIndex);
    return pool[Math.min(pool.length - 1, Math.floor((options.random ?? Math.random)() * pool.length))].index;
  }
  const next = currentIndex + 1;
  if (next < items.length) return next;
  return options.repeatMode === "all" ? 0 : -1;
}
