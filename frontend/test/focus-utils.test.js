import { expect, test } from "vitest";
import { clampFocusMinutes, formatCountdown, systemTimeKey } from "../src/utils/focus.js";

test("focus minutes stay inside the supported range", () => {
  expect(clampFocusMinutes(0)).toBe(1);
  expect(clampFocusMinutes(45.4)).toBe(45);
  expect(clampFocusMinutes(999)).toBe(180);
});

test("countdown uses zero-padded minutes and seconds", () => {
  expect(formatCountdown(1500)).toBe("25:00");
  expect(formatCountdown(65)).toBe("01:05");
  expect(formatCountdown(-1)).toBe("00:00");
});

test("system time follows the same seven daily periods as the scene page", () => {
  expect(systemTimeKey(new Date("2026-06-27T06:00:00"))).toBe("morning");
  expect(systemTimeKey(new Date("2026-06-27T12:00:00"))).toBe("noon");
  expect(systemTimeKey(new Date("2026-06-27T23:30:00"))).toBe("midnight");
});
