<template>
  <Teleport to="body">
    <dialog ref="dialog" class="image-viewer" aria-label="图片预览" @cancel.prevent.stop="close" @keydown="onKeydown">
      <header class="viewer-header">
        <span aria-live="polite">图片 {{ images.length ? index + 1 : 0 }} / {{ images.length }}</span>
        <button ref="closeButton" type="button" aria-label="关闭图片浏览" @click="close">关闭 ×</button>
      </header>
      <figure ref="stage" class="viewer-stage" :class="{ dragging: pointers.size > 0, zoomed: scale > minimumScale }"
        @wheel.prevent="wheel" @pointerdown="pointerDown" @pointermove="pointerMove"
        @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @dblclick="toggleActual">
        <img v-if="currentImage && status !== 'error'" :key="imageKey" :src="currentImage" :style="imageStyle"
          :alt="`图片 ${index + 1}`" draggable="false" decoding="async" @load="loaded" @error="failed" />
        <div v-if="status !== 'ready'" class="viewer-state" role="status">
          <template v-if="status === 'loading'">正在加载清晰图…</template>
          <template v-else>图片加载失败<button v-if="currentImage" type="button" @click="retry">重试加载</button></template>
        </div>
      </figure>
      <footer class="viewer-toolbar" aria-label="图片操作">
        <div class="viewer-controls">
          <button type="button" aria-label="上一张" :disabled="index <= 0" @click="switchImage(-1)">‹</button>
          <button type="button" :disabled="status !== 'ready'" @click="fit">适应窗口</button>
          <button type="button" :disabled="status !== 'ready'" @click="actual">实际大小</button>
          <button v-if="isLongImage" type="button" :disabled="status !== 'ready'" @click="fitWidth">适应宽度</button>
          <button type="button" aria-label="下一张" :disabled="index >= images.length - 1" @click="switchImage(1)">›</button>
        </div>
        <div class="viewer-controls">
          <button type="button" aria-label="缩小" :disabled="status !== 'ready' || scale <= minimumScale" @click="zoom(scale / 1.25)"><AppIcon name="minus" /></button>
          <output class="viewer-scale" aria-label="缩放比例">{{ status === 'ready' ? `${Math.round(scale * 100)}%` : '—' }}</output>
          <button type="button" aria-label="放大" :disabled="status !== 'ready' || scale >= MAX_IMAGE_SCALE" @click="zoom(scale * 1.25)"><AppIcon name="plus" /></button>
        </div>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { anchoredOffset, clampOffset, fitScale, MAX_IMAGE_SCALE, type Point } from "../../utils/imageViewerGeometry";
import { isLongImage as classifyLongImage } from '../../media/mediaPresentation';

const props = withDefaults(defineProps<{ images: string[]; initialIndex?: number }>(), { initialIndex: 0 });
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const index = ref(0);
const scale = ref(1);
const offset = ref<Point>({ x: 0, y: 0 });
const natural = ref({ width: 0, height: 0 });
const viewport = ref({ width: 0, height: 0 });
const status = ref<"loading" | "ready" | "error">("loading");
const attempt = ref(0);
const pointers = reactive(new Map<number, Point>());
const currentImage = computed(() => props.images[index.value] || "");
const imageKey = computed(() => `${index.value}:${currentImage.value}:${attempt.value}`);
const minimumScale = computed(() => fitScale(natural.value, viewport.value));
const isLongImage = computed(() => classifyLongImage(natural.value.width, natural.value.height));
const imageStyle = computed(() => ({
  width: `${natural.value.width}px`, height: `${natural.value.height}px`,
  visibility: status.value === "ready" ? "visible" as const : "hidden" as const,
  transform: `translate(-50%, -50%) translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`
}));
let restoreFocus: HTMLElement | null = null;
let oldOverflow = "";
let resizeObserver: ResizeObserver | undefined;
let closing = false;
let swipeStart: Point | null = null;
let adjacentImages: HTMLImageElement[] = [];

// Compare values, not array identity: callers map asset URLs on every render.
watch(() => JSON.stringify([props.images, props.initialIndex]), () => {
  index.value = Math.max(0, Math.min(props.images.length - 1, props.initialIndex));
}, { immediate: true });
watch(imageKey, reset, { immediate: true });
watch(() => status.value, value => {
  adjacentImages.forEach(image => image.removeAttribute("src"));
  adjacentImages = [];
  if (value !== "ready") return;
  for (const neighbor of [index.value - 1, index.value + 1]) {
    const url = props.images[neighbor];
    if (!url) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    adjacentImages.push(image);
  }
});

function reset() {
  pointers.clear();
  swipeStart = null;
  status.value = currentImage.value ? "loading" : "error";
  natural.value = { width: 0, height: 0 };
  offset.value = { x: 0, y: 0 };
  scale.value = 1;
}
function constrain() { offset.value = clampOffset(offset.value, natural.value, viewport.value, scale.value); }
function measure() {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  const wasFit = Math.abs(scale.value - minimumScale.value) < .0001;
  viewport.value = { width: rect.width, height: rect.height };
  if (wasFit) fit();
  else { scale.value = Math.max(minimumScale.value, scale.value); constrain(); }
}
function loaded(event: Event) {
  const img = event.target as HTMLImageElement;
  if (img !== stage.value?.querySelector("img")) return;
  natural.value = { width: img.naturalWidth, height: img.naturalHeight };
  status.value = "ready";
  measure();
  fit();
}
function failed(event: Event) {
  if (event.target === stage.value?.querySelector("img")) status.value = "error";
}
function retry() { attempt.value++; }
function fit() { scale.value = minimumScale.value; offset.value = { x: 0, y: 0 }; }
function actual() { zoom(1); }
function fitWidth() {
  zoom(viewport.value.width / natural.value.width);
  // Long screenshots open at the top, not at their midpoint.
  offset.value = { x: 0, y: Math.max(0, (natural.value.height * scale.value - viewport.value.height) / 2) };
}
function toggleActual() { if (status.value === "ready") Math.abs(scale.value - minimumScale.value) < .0001 ? actual() : fit(); }
function zoom(value: number, from: Point = { x: 0, y: 0 }, to = from) {
  if (status.value !== "ready") return;
  const next = Math.min(MAX_IMAGE_SCALE, Math.max(minimumScale.value, value));
  offset.value = anchoredOffset(offset.value, scale.value, next, from, to);
  scale.value = next;
  constrain();
}
function localPoint(event: PointerEvent | WheelEvent): Point {
  const rect = stage.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
}
function wheel(event: WheelEvent) {
  if (event.deltaY) zoom(scale.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15), localPoint(event));
}
function pointerDown(event: PointerEvent) {
  if (status.value !== "ready" || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  pointers.set(event.pointerId, localPoint(event));
  swipeStart = pointers.size === 1 && event.pointerType === "touch" && Math.abs(scale.value - minimumScale.value) < .0001
    ? localPoint(event) : null;
  stage.value?.setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const before = [...pointers.values()].slice(0, 2);
  const next = localPoint(event);
  pointers.set(event.pointerId, next);
  if (pointers.size === 1) {
    offset.value = { x: offset.value.x + next.x - previous.x, y: offset.value.y + next.y - previous.y };
    constrain();
  } else {
    const after = [...pointers.values()].slice(0, 2);
    const distance = (points: Point[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const center = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
    if (distance(before) > 0) zoom(scale.value * distance(after) / distance(before), center(before), center(after));
  }
}
function pointerEnd(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  const start = swipeStart;
  pointers.delete(event.pointerId);
  swipeStart = null;
  if (event.type !== "pointerup" || !start || Math.abs(scale.value - minimumScale.value) > .0001) return;
  const end = localPoint(event);
  if (Math.abs(end.x - start.x) > 60 && Math.abs(end.x - start.x) > Math.abs(end.y - start.y) * 2) {
    switchImage(end.x < start.x ? 1 : -1);
  }
}
function switchImage(direction: number) { index.value = Math.max(0, Math.min(props.images.length - 1, index.value + direction)); }
function close() {
  if (closing) return;
  closing = true;
  closeMotionDialog(dialog.value, false, () => emit("close"));
}
function onKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === "Escape") { event.preventDefault(); close(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); switchImage(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); switchImage(1); }
  if (event.key === "Tab") {
    const buttons = [...dialog.value!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
onMounted(async () => {
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  oldOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  openMotionDialog(dialog.value);
  closeButton.value?.focus({ preventScroll: true });
  await nextTick();
  if (!stage.value || closing) return;
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(stage.value);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  adjacentImages.forEach(image => image.removeAttribute("src"));
  adjacentImages = [];
  pointers.clear();
  closeMotionDialog(dialog.value);
  document.body.style.overflow = oldOverflow;
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
});
</script>

<style scoped>
.image-viewer { position: fixed; inset: 0; margin: 0; padding: 16px; width: 100%; height: 100%; max-width: none; max-height: none; box-sizing: border-box; border: 0; color: #f5f3ea; background: #101512; overscroll-behavior: contain; }
.image-viewer[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; }
.image-viewer::backdrop { background: #101512; }
.viewer-header, .viewer-toolbar, .viewer-controls { display: flex; align-items: center; gap: 8px; }
.viewer-header { justify-content: space-between; font-size: 14px; }
.viewer-toolbar { justify-content: center; flex-wrap: wrap; }
.viewer-stage { position: relative; min-width: 0; min-height: 0; margin: 0; overflow: hidden; touch-action: none; cursor: zoom-in; }
.viewer-stage.zoomed { cursor: grab; }
.viewer-stage.dragging { cursor: grabbing; }
.viewer-stage img { position: absolute; top: 50%; left: 50%; max-width: none; max-height: none; user-select: none; pointer-events: none; transform-origin: center; }
.viewer-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 16px; }
.image-viewer button { min-height: 44px; min-width: 44px; padding: 8px 12px; border: 1px solid #566056; border-radius: 10px; background: #242d26; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; }
@media(hover:hover) and (pointer:fine){.image-viewer button:hover:not(:disabled) { background: #374338; }}
.image-viewer button:focus-visible { outline: 2px solid #d0dea9; outline-offset: 2px; }
.image-viewer button:disabled { opacity: .4; cursor: default; }
.viewer-scale { width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
@media (max-width: 540px) { .image-viewer { padding: 10px; padding-bottom: max(10px, env(safe-area-inset-bottom)); } .viewer-controls { gap: 5px; } .image-viewer button { padding: 8px; font-size: 13px; } }
/* No blur or animated transforms: reduced motion/transparency and low-power
   preferences need no separate fallback and remain fully operable. */
</style>
