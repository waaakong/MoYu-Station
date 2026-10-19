import {CLASSIC_GAME_IDS,type ClassicGame} from './games';
export const ENTERTAINMENT_TOOL_IDS = ["breathing", "wooden-fish", "memory-cards", "fish-sorting",...CLASSIC_GAME_IDS] as const;
export const ENTERTAINMENT_STATE_IDS = ["preferences", ...ENTERTAINMENT_TOOL_IDS] as const;

export type EntertainmentToolId = (typeof ENTERTAINMENT_TOOL_IDS)[number];
export type EntertainmentStateId = (typeof ENTERTAINMENT_STATE_IDS)[number];
export type EntertainmentTempo = "slow" | "medium" | "fast";
export type EntertainmentPauseReason = "hidden" | "blurred" | "suspended" | "boss-mode" | "manual";

export interface EntertainmentPreferencesState {
  version: 1;
  toolId: "preferences";
  soundEnabled: boolean;
  reducedMotion: boolean;
  solidBackground: boolean;
  lastToolId?: EntertainmentToolId;
}

export interface BreathingEntertainmentState {
  version: 1;
  toolId: "breathing";
  elapsedMs: number;
  completedRounds: number;
}

export interface WoodenFishEntertainmentState {
  version: 1;
  toolId: "wooden-fish";
  count: number;
  tempo: EntertainmentTempo;
}

export interface MemoryCardState {
  id: string;
  symbol: string;
  matched: boolean;
}

export interface MemoryCardsEntertainmentState {
  version: 1;
  toolId: "memory-cards";
  cards: MemoryCardState[];
  revealedIds: string[];
  moves: number;
  elapsedMs: number;
  status: "idle" | "playing" | "paused" | "completed";
}

export type FishColor = "coral" | "gold" | "mint";
export type FishShape = "round" | "long" | "triangle";
export type FishSortDimension = "color" | "shape";

export interface SortableFishState {
  id: string;
  color: FishColor;
  shape: FishShape;
  placedPool?: string;
}

export interface FishSortingEntertainmentState {
  version: 1;
  toolId: "fish-sorting";
  dimension: FishSortDimension;
  fish: SortableFishState[];
  selectedFishId?: string;
  status: "idle" | "playing" | "paused" | "completed";
}

export type EntertainmentState =
  | EntertainmentPreferencesState
  | BreathingEntertainmentState
  | WoodenFishEntertainmentState
  | MemoryCardsEntertainmentState
  | FishSortingEntertainmentState
  | ClassicGame;

export interface EntertainmentStateRequest { toolId: EntertainmentStateId }

export interface SaveEntertainmentStateRequest extends EntertainmentStateRequest {
  state: EntertainmentState;
  /** Required compare-and-swap baseline for classic games; null means no record may exist. */
  expected?: {generation:string;revision:number}|null;
}

export interface EntertainmentStateRecord {
  toolId: EntertainmentStateId;
  state: EntertainmentState;
  updatedAt: number;
}

export type DesktopLifecycleEvent = { type: "suspend" | "resume" };
