import { describe, expect, it } from "vitest";
import {
  breathingSnapshot,
  createFishSortingGame,
  createMemoryGame,
  placeFish,
  resolveMemoryPair,
  revealMemoryCard,
  sanitizeEntertainmentState,
  updatePauseReasons
} from "../src/entertainment/runtime";

describe("entertainment runtime", () => {
  it("maps the complete 4/2/6 breathing cycle and sixty-second boundary", () => {
    expect(breathingSnapshot(0)).toMatchObject({ phase: "inhale", remainingMs: 60_000 });
    expect(breathingSnapshot(3_999).phase).toBe("inhale");
    expect(breathingSnapshot(4_000).phase).toBe("hold");
    expect(breathingSnapshot(6_000).phase).toBe("exhale");
    expect(breathingSnapshot(12_000).phase).toBe("inhale");
    expect(breathingSnapshot(60_000)).toMatchObject({ phase: "complete", progress: 1, remainingMs: 0 });
  });

  it("creates twelve deterministic cards and locks after the second reveal", () => {
    let game = createMemoryGame(() => 0.25);
    expect(game.cards).toHaveLength(12);
    expect(new Set(game.cards.map((card) => card.id)).size).toBe(12);
    const pair = game.cards.filter((card) => card.symbol === game.cards[0]!.symbol);
    game = revealMemoryCard(game, pair[0]!.id);
    game = revealMemoryCard(game, pair[1]!.id);
    expect(game.revealedIds).toHaveLength(2);
    expect(revealMemoryCard(game, game.cards.find((card) => !game.revealedIds.includes(card.id))!.id)).toBe(game);
    game = resolveMemoryPair(game);
    expect(game.cards.filter((card) => card.matched)).toHaveLength(2);
    expect(game.moves).toBe(1);
  });

  it("gives every fish one correct pool and rejects wrong placement", () => {
    const game = createFishSortingGame(() => 0.1);
    expect(game.dimension).toBe("color");
    expect(game.fish).toHaveLength(12);
    const fish = game.fish[0]!;
    expect(placeFish(game, fish.id, "not-a-pool")).toEqual({ state: game, correct: false });
    const placed = placeFish(game, fish.id, fish.color);
    expect(placed.correct).toBe(true);
    expect(placed.state.fish.find((item) => item.id === fish.id)?.placedPool).toBe(fish.color);
  });

  it("manages pause reasons idempotently", () => {
    let reasons = updatePauseReasons([], "hidden", true);
    reasons = updatePauseReasons(reasons, "hidden", true);
    reasons = updatePauseReasons(reasons, "blurred", true);
    expect(reasons).toEqual(["blurred", "hidden"]);
    expect(updatePauseReasons(reasons, "hidden", false)).toEqual(["blurred"]);
  });

  it("isolates malformed persisted state", () => {
    expect(sanitizeEntertainmentState("breathing", { version: 99, toolId: "breathing", elapsedMs: 9 })).toMatchObject({ elapsedMs: 0 });
    expect(sanitizeEntertainmentState("wooden-fish", { version: 1, toolId: "wooden-fish", count: Infinity, tempo: "turbo" })).toMatchObject({ count: 0, tempo: "medium" });
    expect(sanitizeEntertainmentState("memory-cards", { version: 1, toolId: "memory-cards", cards: [] })).toMatchObject({ status: "idle", cards: [] });
  });
});
