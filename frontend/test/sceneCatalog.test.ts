import { describe, expect, it } from "vitest";
import { sceneKeys, scenes, timeFromSystem, timePoints } from "../src/data/scenes";

describe("built-in scene catalog", () => {
  it("contains exactly six scenes and seven time points without custom uploads", () => {
    expect(sceneKeys).toEqual(["mountain", "beach", "forest", "library", "cafe", "snow"]);
    expect(scenes).toHaveLength(6);
    expect(timePoints).toHaveLength(7);
    expect(scenes.some((scene) => scene.key === ("custom" as never))).toBe(false);
    for (const scene of scenes) expect(Object.keys(scene.assets)).toHaveLength(7);
  });

  it("keeps the approved seven system-time boundaries", () => {
    expect(timeFromSystem(new Date("2026-09-14T06:00:00"))).toBe("morning");
    expect(timeFromSystem(new Date("2026-09-14T09:00:00"))).toBe("forenoon");
    expect(timeFromSystem(new Date("2026-09-14T11:30:00"))).toBe("noon");
    expect(timeFromSystem(new Date("2026-09-14T14:00:00"))).toBe("afternoon");
    expect(timeFromSystem(new Date("2026-09-14T17:00:00"))).toBe("dusk");
    expect(timeFromSystem(new Date("2026-09-14T19:00:00"))).toBe("night");
    expect(timeFromSystem(new Date("2026-09-14T23:00:00"))).toBe("midnight");
  });
});
