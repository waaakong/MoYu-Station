<template><canvas ref="canvas" class="visualizer-canvas" aria-hidden="true"></canvas></template>

<script setup lang="ts">
import type { VisualizerMode, VisualizerQuality } from "@studyroom/contracts";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { sharedAudioGraph } from "../../audio/runtime/audioRuntime";
import { VisualizerController, type VisualizerFrame } from "../../audio/visualizer/visualizerController";
import { useShellStore } from "../../stores/shell";

const props = defineProps<{ mode: VisualizerMode; quality: VisualizerQuality; suppressed?: boolean; stage?: boolean; tone?: 'sea' | 'ember' | 'moon' }>();
const shell = useShellStore();
const canvas = ref<HTMLCanvasElement>();
let controller: VisualizerController | undefined;
let observer: ResizeObserver | undefined;
let visibilityObserver: IntersectionObserver | undefined;
let visible = true;

function resize() {
  const element = canvas.value;
  if (!element) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  element.width = Math.max(1, Math.round(element.clientWidth * ratio));
  element.height = Math.max(1, Math.round(element.clientHeight * ratio));
}

function render(frame: VisualizerFrame) {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!element || !context || props.mode === "off") return;
  const width = element.width;
  const height = element.height;
  context.clearRect(0, 0, width, height);
  // Silence remains silence: never generate fake beat motion for an idle source.
  if (!frame.frequency.some((value) => value > 1)) return;
  const rgb = props.tone === 'ember' ? '223,167,125' : props.tone === 'moon' ? '215,222,230' : '158,207,190';
  if (props.stage) {
    context.strokeStyle = `rgba(${rgb},.64)`;
    context.fillStyle = `rgba(${rgb},.62)`;
    context.lineWidth = Math.max(1, width / 1000);
    if (props.mode === 'particles') {
      const rows = props.quality === 'high' ? 28 : props.quality === 'medium' ? 22 : 16;
      const columns = props.quality === 'high' ? 56 : 40;
      for (let row = 0; row < rows; row++) {
        const depth = (row + 1) / rows;
        for (let column = 0; column < columns; column++) {
          const signal = frame.frequency[Math.floor(column / columns * frame.frequency.length * .7)] / 255;
          const x = width / 2 + (column / (columns - 1) - .5) * width * (depth * 1.8 + .12);
          const y = height * (.4 + depth * depth * .64) - signal * height * .13 * depth;
          context.globalAlpha = .18 + depth * .65;
          context.beginPath(); context.arc(x, y, Math.max(1, depth * width / 700), 0, Math.PI * 2); context.fill();
        }
      }
      context.globalAlpha = 1;
    } else if (props.mode === 'waveform') {
      for (let ring = 0; ring < 5; ring++) {
        context.globalAlpha = .65 - ring * .1; context.beginPath();
        for (let index = 0; index <= 128; index++) {
          const angle = index / 128 * Math.PI * 2;
          const value = frame.waveform[Math.floor(index / 129 * frame.waveform.length)] / 255 - .5;
          const radius = Math.min(width, height) * (.18 + ring * .045 + value * .12);
          const x = width / 2 + Math.cos(angle) * radius * 1.55;
          const y = height * .65 + Math.sin(angle) * radius * .48;
          if (!index) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath(); context.stroke();
      }
      context.globalAlpha = 1;
    } else {
      const bars = props.quality === 'high' ? 100 : 64;
      const gap = width / bars;
      for (let index = 0; index < bars; index++) {
        const value = frame.frequency[Math.floor(index / bars * frame.frequency.length * .7)] / 255;
        const barHeight = value * height * .38;
        context.fillRect(gap * index, height * .76 - barHeight, Math.max(1, gap - 5), barHeight);
      }
    }
    return;
  }
  context.strokeStyle = "rgba(226, 206, 164, .72)";
  context.fillStyle = "rgba(226, 206, 164, .34)";
  context.lineWidth = Math.max(1, width / 700);
  if (props.mode === "waveform") {
    context.beginPath();
    const step = Math.max(1, Math.floor(frame.waveform.length / 96));
    for (let index = 0, point = 0; index < frame.waveform.length; index += step, point += 1) {
      const x = point / Math.ceil(frame.waveform.length / step) * width;
      const y = frame.waveform[index] / 255 * height;
      if (!point) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    return;
  }
  const bars = props.mode === "particles" ? 30 : props.mode === "cover" ? 36 : 56;
  const gap = width / bars;
  for (let index = 0; index < bars; index += 1) {
    const value = frame.frequency[Math.floor(index / bars * frame.frequency.length)] / 255;
    if (props.mode === "particles") {
      const radius = Math.max(1.5, value * 5 * (width / 600));
      context.beginPath();
      context.arc(gap * (index + .5), height * (.82 - value * .62), radius, 0, Math.PI * 2);
      context.fill();
    } else {
      const barHeight = Math.max(2, value * height * (props.mode === "cover" ? .35 : .78));
      context.fillRect(gap * index, height - barHeight, Math.max(1, gap - 2), barHeight);
    }
  }
}

function sync() {
  controller?.configure(props.quality);
  const suppressed = Boolean(props.suppressed) || shell.motionReduced || props.mode === "off" || document.hidden || !visible;
  controller?.setSuppressed(suppressed);
  if (suppressed) canvas.value?.getContext('2d')?.clearRect(0, 0, canvas.value.width, canvas.value.height);
}

onMounted(() => {
  resize();
  observer = new ResizeObserver(resize);
  if (canvas.value) observer.observe(canvas.value);
  visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  if (canvas.value) visibilityObserver.observe(canvas.value);
  if (sharedAudioGraph.initialize()) {
    const analyser = sharedAudioGraph.analyserNode();
    if (analyser) {
      controller = new VisualizerController(analyser, render);
      sync();
      controller.start();
    }
  }
  document.addEventListener("visibilitychange", sync);
});
watch(() => [props.mode, props.quality, props.suppressed, shell.motionReduced], sync);
onBeforeUnmount(() => { controller?.stop(); observer?.disconnect(); visibilityObserver?.disconnect(); document.removeEventListener("visibilitychange", sync); });
</script>

<style scoped>.visualizer-canvas{width:100%;height:100%;display:block}</style>
