import type {
  BreathingEntertainmentState,
  EntertainmentPauseReason,
  EntertainmentPreferencesState,
  EntertainmentState,
  EntertainmentStateId,
  EntertainmentTempo,
  EntertainmentToolId,
  FishSortingEntertainmentState,
  MemoryCardsEntertainmentState,
  WoodenFishEntertainmentState
} from "@studyroom/contracts";
import { defineStore } from "pinia";
import {
  createFishSortingGame,
  createMemoryGame,
  defaultEntertainmentState,
  placeFish,
  resolveMemoryPair,
  revealMemoryCard,
  updatePauseReasons
} from "../entertainment/runtime";
import { readAllEntertainmentState, saveEntertainmentState } from "../entertainment/storage";

const SAVE_DELAY_MS = 300;
const saveTimers = new Map<EntertainmentStateId, ReturnType<typeof setTimeout>>();
const inFlightSaves = new Set<Promise<void>>();
const failedSaves = new Set<EntertainmentStateId>();
const saveChains = new Map<EntertainmentStateId, Promise<void>>();
const loading = new WeakMap<object, Promise<void>>();

export const useEntertainmentStore = defineStore("entertainment", {
  state: () => ({
    initialized: false,
    initializationOperation: 0,
    changedBeforeLoad: new Set<EntertainmentStateId>(),
    activeTool: undefined as EntertainmentToolId | undefined,
    preferences: defaultEntertainmentState("preferences") as EntertainmentPreferencesState,
    breathing: defaultEntertainmentState("breathing") as BreathingEntertainmentState,
    woodenFish: defaultEntertainmentState("wooden-fish") as WoodenFishEntertainmentState,
    memoryCards: defaultEntertainmentState("memory-cards") as MemoryCardsEntertainmentState,
    fishSorting: defaultEntertainmentState("fish-sorting") as FishSortingEntertainmentState,
    pauseReasons: [] as EntertainmentPauseReason[],
    errorCode: undefined as string | undefined
  }),
  getters: {
    paused: (state) => state.pauseReasons.length > 0
  },
  actions: {
    async initialize() {
      if (this.initialized) return;
      const pending = loading.get(this);
      if (pending) return pending;
      const generation = ++this.initializationOperation;
      const operation = (async () => {
        try {
          const records = await readAllEntertainmentState();
          if (generation !== this.initializationOperation) return;
          for (const state of records) if (!this.changedBeforeLoad.has(state.toolId)) this.applyState(state);
        } catch {
          if (generation === this.initializationOperation) this.errorCode = "ENTERTAINMENT_STATE_READ_FAILED";
        } finally {
          if (generation === this.initializationOperation) { this.initialized = true; loading.delete(this); }
        }
      })();
      loading.set(this, operation);
      return operation;
    },
    applyState(state: EntertainmentState) {
      if (state.toolId === "preferences") this.preferences = state;
      else if (state.toolId === "breathing") this.breathing = state;
      else if (state.toolId === "wooden-fish") this.woodenFish = state;
      else if (state.toolId === "memory-cards") this.memoryCards = state;
      else if(state.toolId==='fish-sorting')this.fishSorting = state;
    },
    stateFor(toolId: EntertainmentStateId): EntertainmentState {
      if (toolId === "preferences") return this.preferences;
      if (toolId === "breathing") return this.breathing;
      if (toolId === "wooden-fish") return this.woodenFish;
      if (toolId === "memory-cards") return this.memoryCards;
      if(toolId==='fish-sorting')return this.fishSorting;
      throw new Error('CLASSIC_GAME_HAS_OWN_LIFECYCLE');
    },
    enterTool(toolId: EntertainmentToolId) {
      this.activeTool = toolId;
      this.preferences.lastToolId = toolId;
      this.scheduleSave("preferences");
    },
    leaveTool() { this.activeTool = undefined; },
    setPreference<K extends "soundEnabled" | "reducedMotion" | "solidBackground">(key: K, value: EntertainmentPreferencesState[K]) {
      this.preferences[key] = value;
      this.scheduleSave("preferences");
    },
    updateBreathing(elapsedMs: number, completed = false) {
      this.breathing.elapsedMs = Math.min(60_000, Math.max(0, Math.round(elapsedMs)));
      if (completed && this.breathing.elapsedMs === 60_000) this.breathing.completedRounds += 1;
      this.scheduleSave("breathing");
    },
    resetBreathing() { this.breathing.elapsedMs = 0; this.scheduleSave("breathing"); },
    hitWoodenFish(amount = 1) {
      this.woodenFish.count = Math.min(999_999_999, this.woodenFish.count + Math.max(0, Math.round(amount)));
      this.scheduleSave("wooden-fish");
    },
    setWoodenFishTempo(tempo: EntertainmentTempo) { this.woodenFish.tempo = tempo; this.scheduleSave("wooden-fish"); },
    resetWoodenFish() { this.woodenFish.count = 0; this.scheduleSave("wooden-fish"); },
    startMemoryGame(random: () => number = Math.random) { this.memoryCards = createMemoryGame(random); this.scheduleSave("memory-cards"); },
    revealMemory(cardId: string) { this.memoryCards = revealMemoryCard(this.memoryCards, cardId); this.scheduleSave("memory-cards"); },
    resolveMemory() { this.memoryCards = resolveMemoryPair(this.memoryCards); this.scheduleSave("memory-cards"); },
    resumeMemory() { if (this.memoryCards.cards.length) { this.memoryCards.status = "playing"; this.scheduleSave("memory-cards"); } },
    startFishGame(random: () => number = Math.random) { this.fishSorting = createFishSortingGame(random); this.scheduleSave("fish-sorting"); },
    selectFish(fishId?: string) { this.fishSorting.selectedFishId = fishId; this.scheduleSave("fish-sorting"); },
    sortFish(fishId: string, pool: string) {
      const result = placeFish(this.fishSorting, fishId, pool);
      this.fishSorting = result.state;
      if (result.correct) this.scheduleSave("fish-sorting");
      return result.correct;
    },
    resumeFish() { if (this.fishSorting.fish.length) { this.fishSorting.status = "playing"; this.scheduleSave("fish-sorting"); } },
    setPauseReason(reason: EntertainmentPauseReason, active: boolean) {
      this.pauseReasons = updatePauseReasons(this.pauseReasons, reason, active);
      if (active) {
        if (this.memoryCards.status === "playing" && this.memoryCards.revealedIds.length === 2) {
          this.memoryCards = resolveMemoryPair(this.memoryCards);
          this.scheduleSave("memory-cards");
        }
        if (this.memoryCards.status === "playing") this.memoryCards.status = "paused";
        if (this.fishSorting.status === "playing") this.fishSorting.status = "paused";
      }
    },
    scheduleSave(toolId: EntertainmentStateId) {
      if (!this.initialized) this.changedBeforeLoad.add(toolId);
      const current = saveTimers.get(toolId);
      if (current) clearTimeout(current);
      saveTimers.set(toolId, setTimeout(() => { saveTimers.delete(toolId); void this.persist(toolId); }, SAVE_DELAY_MS));
    },
    async persist(toolId: EntertainmentStateId) {
      const snapshot = JSON.parse(JSON.stringify(this.stateFor(toolId))) as EntertainmentState;
      const previous = saveChains.get(toolId) ?? Promise.resolve();
      const operation = previous.then(() => saveEntertainmentState(toolId, snapshot));
      const settled = operation.catch(() => undefined);
      saveChains.set(toolId, settled);
      inFlightSaves.add(operation);
      try {
        await operation;
        failedSaves.delete(toolId);
        if (!failedSaves.size) this.errorCode = undefined;
      } catch {
        failedSaves.add(toolId);
        this.errorCode = "ENTERTAINMENT_STATE_WRITE_FAILED";
      } finally {
        inFlightSaves.delete(operation);
        if (saveChains.get(toolId) === settled) saveChains.delete(toolId);
      }
    },
    async flush() {
      const pending = [...new Set([...saveTimers.keys(), ...failedSaves])];
      for (const timer of saveTimers.values()) clearTimeout(timer);
      saveTimers.clear();
      await Promise.all(pending.map((toolId) => this.persist(toolId)));
      await Promise.allSettled([...inFlightSaves]);
    },
    dispose() {
      this.initializationOperation++;
      loading.delete(this);
      for (const timer of saveTimers.values()) clearTimeout(timer);
      saveTimers.clear();
      this.pauseReasons = [];
      this.activeTool = undefined;
    }
  }
});
