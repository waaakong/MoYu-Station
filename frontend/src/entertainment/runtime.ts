import {CLASSIC_GAME_IDS,ENTERTAINMENT_TOOL_IDS,isClassicGame} from '@studyroom/contracts';
import type {
  BreathingEntertainmentState,
  EntertainmentPauseReason,
  EntertainmentState,
  EntertainmentStateId,
  EntertainmentToolId,
  FishColor,
  FishShape,
  FishSortingEntertainmentState,
  FishSortDimension,
  MemoryCardsEntertainmentState,
  SortableFishState,
  WoodenFishEntertainmentState
} from "@studyroom/contracts";

export const BREATHING_TOTAL_MS = 60_000;
export const WOODEN_FISH_INTERVALS = { slow: 1_200, medium: 800, fast: 500 } as const;
export const MEMORY_SYMBOLS = ["叶", "月", "雨", "书", "茶", "鱼"] as const;
export const FISH_COLORS: FishColor[] = ["coral", "gold", "mint"];
export const FISH_SHAPES: FishShape[] = ["round", "long", "triangle"];

const BREATH_PHASES = [
  { phase: "inhale" as const, durationMs: 4_000 },
  { phase: "hold" as const, durationMs: 2_000 },
  { phase: "exhale" as const, durationMs: 6_000 }
];

export interface BreathingSnapshot {
  phase: "inhale" | "hold" | "exhale" | "complete";
  phaseElapsedMs: number;
  phaseDurationMs: number;
  elapsedMs: number;
  remainingMs: number;
  progress: number;
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback = minimum): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

export function breathingSnapshot(elapsedMs: number): BreathingSnapshot {
  const elapsed = clampInteger(elapsedMs, 0, BREATHING_TOTAL_MS);
  if (elapsed >= BREATHING_TOTAL_MS) return {
    phase: "complete", phaseElapsedMs: 0, phaseDurationMs: 0, elapsedMs: elapsed,
    remainingMs: 0, progress: 1
  };
  let cycleElapsed = elapsed % 12_000;
  for (const item of BREATH_PHASES) {
    if (cycleElapsed < item.durationMs) return {
      phase: item.phase,
      phaseElapsedMs: cycleElapsed,
      phaseDurationMs: item.durationMs,
      elapsedMs: elapsed,
      remainingMs: BREATHING_TOTAL_MS - elapsed,
      progress: elapsed / BREATHING_TOTAL_MS
    };
    cycleElapsed -= item.durationMs;
  }
  throw new Error("BREATHING_PHASE_UNREACHABLE");
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.min(0.999999999, Math.max(0, random())) * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function createMemoryGame(random: () => number = Math.random): MemoryCardsEntertainmentState {
  const cards = MEMORY_SYMBOLS.flatMap((symbol) => [0, 1].map((copy) => ({ id: `${symbol}-${copy}`, symbol, matched: false })));
  return { version: 1, toolId: "memory-cards", cards: shuffle(cards, random), revealedIds: [], moves: 0, elapsedMs: 0, status: "playing" };
}

export function revealMemoryCard(state: MemoryCardsEntertainmentState, cardId: string): MemoryCardsEntertainmentState {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || card.matched || state.status === "completed" || state.revealedIds.length >= 2 || state.revealedIds.includes(cardId)) return state;
  const revealedIds = [...state.revealedIds, cardId];
  return { ...state, status: "playing", revealedIds, moves: revealedIds.length === 2 ? state.moves + 1 : state.moves };
}

export function resolveMemoryPair(state: MemoryCardsEntertainmentState): MemoryCardsEntertainmentState {
  if (state.revealedIds.length !== 2) return state;
  const [first, second] = state.revealedIds.map((id) => state.cards.find((card) => card.id === id));
  const matched = Boolean(first && second && first.symbol === second.symbol);
  const cards = matched ? state.cards.map((card) => state.revealedIds.includes(card.id) ? { ...card, matched: true } : card) : state.cards;
  const completed = cards.length > 0 && cards.every((card) => card.matched);
  return { ...state, cards, revealedIds: [], status: completed ? "completed" : "playing" };
}

export function createFishSortingGame(random: () => number = Math.random): FishSortingEntertainmentState {
  const dimension: FishSortDimension = random() < 0.5 ? "color" : "shape";
  const combinations = Array.from({ length: 12 }, (_, index): SortableFishState => ({
    id: `fish-${index + 1}`,
    color: FISH_COLORS[index % FISH_COLORS.length]!,
    shape: FISH_SHAPES[Math.floor(index / FISH_COLORS.length) % FISH_SHAPES.length]!
  }));
  return { version: 1, toolId: "fish-sorting", dimension, fish: shuffle(combinations, random), status: "playing" };
}

export function expectedFishPool(state: FishSortingEntertainmentState, fish: SortableFishState): string {
  return state.dimension === "color" ? fish.color : fish.shape;
}

export function placeFish(state: FishSortingEntertainmentState, fishId: string, pool: string): { state: FishSortingEntertainmentState; correct: boolean } {
  const fish = state.fish.find((item) => item.id === fishId);
  if (!fish || fish.placedPool || state.status === "completed" || expectedFishPool(state, fish) !== pool) return { state, correct: false };
  const nextFish = state.fish.map((item) => item.id === fishId ? { ...item, placedPool: pool } : item);
  return {
    correct: true,
    state: { ...state, fish: nextFish, selectedFishId: undefined, status: nextFish.every((item) => item.placedPool) ? "completed" : "playing" }
  };
}

export function updatePauseReasons(reasons: readonly EntertainmentPauseReason[], reason: EntertainmentPauseReason, active: boolean): EntertainmentPauseReason[] {
  const next = new Set(reasons);
  if (active) next.add(reason); else next.delete(reason);
  return [...next].sort();
}

export function defaultEntertainmentState(toolId: EntertainmentStateId): EntertainmentState {
  if (toolId === "preferences") return { version: 1, toolId, soundEnabled: true, reducedMotion: false, solidBackground: false };
  if (toolId === "breathing") return { version: 1, toolId, elapsedMs: 0, completedRounds: 0 };
  if (toolId === "wooden-fish") return { version: 1, toolId, count: 0, tempo: "medium" };
  if (toolId === "memory-cards") return { version: 1, toolId, cards: [], revealedIds: [], moves: 0, elapsedMs: 0, status: "idle" };
  if(toolId==='fish-sorting')return { version: 1, toolId, dimension: "color", fish: [], status: "idle" };
  throw new Error('CLASSIC_GAME_REQUIRES_EXPLICIT_INITIALIZATION');
}

export function sanitizeEntertainmentState(toolId: EntertainmentStateId, input: unknown): EntertainmentState {
  if((CLASSIC_GAME_IDS as readonly string[]).includes(toolId)){
    if(!isClassicGame(input) || input.toolId!==toolId)throw new Error('ENTERTAINMENT_STATE_INVALID_PRESERVED');return input;
  }
  const fallback = defaultEntertainmentState(toolId);
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1 || (input as { toolId?: unknown }).toolId !== toolId) return fallback;
  const value = input as Record<string, unknown>;
  if (toolId === "preferences") return {
    version: 1, toolId,
    soundEnabled: value.soundEnabled !== false,
    reducedMotion: value.reducedMotion === true,
    solidBackground: value.solidBackground === true,
    lastToolId: (ENTERTAINMENT_TOOL_IDS as readonly string[]).includes(String(value.lastToolId)) ? value.lastToolId as EntertainmentToolId : undefined
  };
  if (toolId === "breathing") return { version: 1, toolId, elapsedMs: clampInteger(value.elapsedMs, 0, 60_000), completedRounds: clampInteger(value.completedRounds, 0, 999_999) };
  if (toolId === "wooden-fish") return {
    version: 1, toolId, count: clampInteger(value.count, 0, 999_999_999),
    tempo: ["slow", "medium", "fast"].includes(String(value.tempo)) ? value.tempo as WoodenFishEntertainmentState["tempo"] : "medium"
  };
  if (toolId === "memory-cards") {
    const candidate = value as unknown as MemoryCardsEntertainmentState;
    const ids = Array.isArray(candidate.cards) ? candidate.cards.map((card) => card?.id) : [];
    const valid = candidate.cards?.length === 12 && new Set(ids).size === 12 && candidate.cards.every((card) => typeof card.id === "string" && typeof card.symbol === "string" && typeof card.matched === "boolean");
    if (!valid) return fallback;
    return { ...candidate, version: 1, toolId, revealedIds: candidate.revealedIds.filter((id) => ids.includes(id)).slice(0, 2), moves: clampInteger(candidate.moves, 0, 999_999), elapsedMs: clampInteger(candidate.elapsedMs, 0, 86_400_000), status: candidate.status === "completed" ? "completed" : "paused" };
  }
  if(toolId!=='fish-sorting')throw new Error('ENTERTAINMENT_UNKNOWN_TOOL');
  const candidate = value as unknown as FishSortingEntertainmentState;
  const ids = Array.isArray(candidate.fish) ? candidate.fish.map((fish) => fish?.id) : [];
  const valid = candidate.fish?.length === 12 && new Set(ids).size === 12 && candidate.fish.every((fish) => typeof fish.id === "string" && FISH_COLORS.includes(fish.color) && FISH_SHAPES.includes(fish.shape));
  if (!valid) return fallback;
  return { ...candidate, version: 1, toolId, dimension: candidate.dimension === "shape" ? "shape" : "color", selectedFishId: undefined, status: candidate.status === "completed" ? "completed" : "paused" };
}
