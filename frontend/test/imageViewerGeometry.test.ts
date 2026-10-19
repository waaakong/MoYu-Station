import { describe, expect, it } from "vitest";
import { anchoredOffset, clampOffset, fitScale } from "../src/utils/imageViewerGeometry";

describe("image viewer actual pixel geometry", () => {
  it("fits landscape and portrait without enlarging small images", () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toBe(.5);
    expect(fitScale({ width: 1000, height: 4000 }, { width: 1000, height: 800 })).toBe(.2);
    expect(fitScale({ width: 40, height: 20 }, { width: 1000, height: 800 })).toBe(1);
  });
  it("keeps the image pixel under the zoom anchor", () => {
    expect(anchoredOffset({ x: 0, y: 10 }, .5, 1, { x: 100, y: 50 })).toEqual({ x: -100, y: -30 });
  });
  it("combines pinch center movement with zoom", () => {
    expect(anchoredOffset({ x: 0, y: 0 }, 1, 2, { x: 100, y: 50 }, { x: 120, y: 80 })).toEqual({ x: -80, y: -20 });
  });
  it("clamps axes independently so the image cannot be lost", () => {
    expect(clampOffset({ x: 9999, y: -9999 }, { width: 2000, height: 500 }, { width: 1000, height: 800 }, 1)).toEqual({ x: 500, y: -0 });
    expect(clampOffset({ x: 9999, y: 9999 }, { width: 2000, height: 1000 }, { width: 1000, height: 800 }, .5)).toEqual({ x: 0, y: 0 });
  });
});
