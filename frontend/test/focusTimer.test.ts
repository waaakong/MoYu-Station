import { describe, expect, it } from "vitest";
import { createFocusTimerSession, focusTimerSnapshot, pauseFocusTimer, resumeFocusTimer, sanitizeFocusTimerSession } from "../src/focus/timer";

describe("absolute focus timer", () => {
  it("uses wall-clock time so sleep does not make the timer drift", () => {
    const session = createFocusTimerSession({
      clientRecordId: "record-1", plannedMinutes: 25, sceneCode: "mountain", timeKey: "morning"
    }, 1_000);
    expect(focusTimerSnapshot(session, 1_000 + 25 * 60_000).complete).toBe(true);
  });

  it("does not count paused time", () => {
    const started = createFocusTimerSession({
      clientRecordId: "record-1", plannedMinutes: 25, sceneCode: "mountain", timeKey: "morning"
    }, 1_000);
    const paused = pauseFocusTimer(started, 61_000);
    const resumed = resumeFocusTimer(paused, 600_000);
    const snapshot = focusTimerSnapshot(resumed, 660_000);
    expect(snapshot.elapsedSeconds).toBe(120);
    expect(snapshot.remainingSeconds).toBe(23 * 60);
  });

  it("restores a persisted running session from its absolute target", () => {
    const session = createFocusTimerSession({
      clientRecordId: "record-1", plannedMinutes: 25, sceneCode: "mountain", timeKey: "morning"
    }, 1_000);
    const restored = sanitizeFocusTimerSession(JSON.parse(JSON.stringify(session)));
    expect(restored).toBeDefined();
    expect(focusTimerSnapshot(restored!, 1_000 + 10 * 60_000).remainingSeconds).toBe(15 * 60);
  });
});
