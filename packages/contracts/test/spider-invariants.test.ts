import { describe, expect, it } from 'vitest';
import { newSpider, moveSpider, dealSpider, undoSpider, isClassicGame, type SpiderGame } from '../src/games';
const id = '11111111-1111-4111-8111-111111111111';
function rng(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const board = (game: SpiderGame) => [game.columns, game.stock, game.completed, game.history, game.moves];

describe('spider save and undo invariants', () => {
  it('the structural upper bound including 100 actions fits 32 KiB', () => {
    // Deliberately OVER-estimates valid state: every column is 104 signed cards,
    // stock and completed duplicate them. This is a size bound, not a valid save.
    // Valid history collects at most eight runs in total (enforced by parser).
    const envelope = {
      version: 1, generation: id, revision: Number.MAX_SAFE_INTEGER,
      toolId: 'spider', suits: 4, initial: Array(104).fill(104),
      columns: Array.from({ length: 10 }, () => Array(104).fill(-104)),
      stock: Array(50).fill(104), completed: Array.from({ length: 8 }, () => Array(13).fill(104)),
      history: Array.from({ length: 100 }, (_, index) => ({
        kind: 'move', from: 9, to: 9, count: 104, flipped: false,
        collected: index === 0 ? Array.from({ length: 8 }, () => [9, Array(13).fill(104), false]) : []
      })), moves: Number.MAX_SAFE_INTEGER
    };
    expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength).toBeLessThan(32768);
    expect(isClassicGame(envelope)).toBe(false);
  });

  it.each([1, 2, 4] as const)('%i suits preserves 104 identities and atomically reverses random legal moves/deals', (suits) => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = rng(seed); let game = newSpider(suits, id, random);
      for (let step = 0; step < 110; step++) {
        const candidates: SpiderGame[] = [];
        for (let from = 0; from < 10; from++) {
          const start = game.columns[from]!.length - 1;
          for (let to = 0; to < 10; to++) {
            const next = moveSpider(game, from, start, to);
            if (next !== game) candidates.push(next);
          }
        }
        const dealt = dealSpider(game); if (dealt !== game) candidates.push(dealt);
        if (!candidates.length) break;
        const next = candidates[Math.floor(random() * candidates.length)]!;
        const undo = undoSpider(next);
        // On action 101 the oldest history is intentionally discarded, not restored by undo.
        const expected = structuredClone(game);
        if (game.history.length === 100) expected.history.shift();
        expect(board(undo)).toEqual(board(expected));
        const cards = [...next.columns.flat().map(Math.abs), ...next.stock, ...next.completed.flat()];
        expect(cards).toHaveLength(104); expect(new Set(cards).size).toBe(104);
        expect(new TextEncoder().encode(JSON.stringify(next)).byteLength).toBeLessThan(32768);
        if (step % 20 === 0 || step === 109) expect(isClassicGame(next)).toBe(true);
        game = next;
      }
    }
  });

  it('multiple collections and flips caused by one move undo together', () => {
    const game = newSpider(1, id, rng(6));
    game.columns = Array.from({ length: 10 }, () => []);
    game.columns[0] = [-27, ...Array.from({ length: 13 }, (_, i) => 13 - i)];
    game.columns[1] = [-28, ...Array.from({ length: 12 }, (_, i) => 26 - i)];
    game.columns[2] = [14];
    const used = new Set(game.columns.flat().map(Math.abs));
    game.columns[3] = game.initial.filter(card => !used.has(card)); game.stock = [];
    const result = moveSpider(game, 2, 0, 1);
    expect(result.completed).toHaveLength(2);
    expect(result.columns[0]).toEqual([27]); expect(result.columns[1]).toEqual([28]);
    expect(isClassicGame(result)).toBe(true);
    expect(board(undoSpider(result))).toEqual(board(game));
  });

  it('rejects forged revision and surplus completed-run deltas', () => {
    const game = dealSpider(newSpider(4, id, rng(2)));
    expect(isClassicGame({ ...game, revision: 0 })).toBe(false);
    const forged = structuredClone(game);
    forged.history[0]!.collected = [[0, Array.from({ length: 13 }, (_, i) => 13 - i), false]];
    expect(isClassicGame(forged)).toBe(false);
  });
});
