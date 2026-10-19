import { describe, expect, it } from "vitest";
import { equalPowerCrossfadeCurves, scheduleEqualPowerCrossfade } from "../src/audio/core/crossfade";
import { FakeAudioParam } from "./fakeAudioContext";

describe("equal-power crossfade", () => {
  it("keeps complementary endpoints and an equal-power midpoint", () => {
    const { fadeOut, fadeIn } = equalPowerCrossfadeCurves(65);
    expect(fadeOut[0]).toBeCloseTo(1, 6);
    expect(fadeIn[0]).toBeCloseTo(0, 6);
    expect(fadeOut.at(-1)).toBeCloseTo(0, 6);
    expect(fadeIn.at(-1)).toBeCloseTo(1, 6);
    const midpoint = 32;
    expect(fadeOut[midpoint] ** 2 + fadeIn[midpoint] ** 2).toBeCloseTo(1, 5);
  });

  it("switches immediately when duration is zero", () => {
    const outgoing = new FakeAudioParam(1);
    const incoming = new FakeAudioParam(0);
    scheduleEqualPowerCrossfade(
      outgoing as unknown as AudioParam,
      incoming as unknown as AudioParam,
      2,
      0
    );
    expect(outgoing.value).toBe(0);
    expect(incoming.value).toBe(1);
    expect(outgoing.curves).toHaveLength(0);
  });
});
