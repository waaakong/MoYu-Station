import { onBeforeUnmount, onMounted } from "vue";
import { sceneKeys, timePoints } from "../data/scenes";
import { useSceneStore } from "../stores/scene";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']") || Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}

export function useSceneShortcuts(): void {
  const scene = useSceneStore();

  function selectRelative<T>(items: readonly T[], current: T, direction: number): T {
    const currentIndex = Math.max(0, items.indexOf(current));
    return items[(currentIndex + direction + items.length) % items.length];
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "f" && !event.shiftKey) {
      event.preventDefault();
      scene.cycleMode();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) {
      const times = timePoints.map((time) => time.key);
      scene.setTime(selectRelative(times, scene.timeKey, direction));
    } else {
      scene.setScene(selectRelative(sceneKeys, scene.sceneKey, direction));
    }
  }

  onMounted(() => window.addEventListener("keydown", handleKeydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
}
