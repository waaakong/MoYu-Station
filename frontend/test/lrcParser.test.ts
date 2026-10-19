import { describe, expect, it } from "vitest";
import { parseLrc } from "../src/audio/lyrics/lrcParser";

describe("LRC parser", () => {
  it("parses metadata, multiple timestamps and two or three digit fractions", () => {
    const parsed = parseLrc(`
[ar:Artist]
[00:01.25][00:03.250]First
[125:04.5]Long session
[00:61.00]Invalid seconds
not a lyric
    `);
    expect(parsed.metadata).toEqual({ ar: "Artist" });
    expect(parsed.lines).toEqual([
      { timeMs: 1_250, text: "First" },
      { timeMs: 3_250, text: "First" },
      { timeMs: 7_504_500, text: "Long session" }
    ]);
  });

  it("sorts out-of-order lines stably and tolerates empty text", () => {
    expect(parseLrc("[00:02]Later\n[00:01]\n[00:01]Earlier").lines).toEqual([
      { timeMs: 1_000, text: "" },
      { timeMs: 1_000, text: "Earlier" },
      { timeMs: 2_000, text: "Later" }
    ]);
  });
});
