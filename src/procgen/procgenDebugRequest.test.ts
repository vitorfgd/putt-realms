import { describe, expect, it } from "vitest";
import {
  createProcgenDebugRequest,
  normalizeProcgenDebugDifficulty,
  procgenDebugMaxTilesForDifficulty,
} from "./procgenDebugRequest";

describe("procgen debug request", () => {
  it("uses the HTML debug difficulty as level index and endpoint target", () => {
    expect(createProcgenDebugRequest("seed-a", 6)).toEqual({
      seed: "seed-a",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 46,
      allowRamps: true,
      allowCurves: true,
    });
  });

  it("keeps the existing 1..20 clamp and rounded max-tile formula", () => {
    expect(normalizeProcgenDebugDifficulty(undefined)).toBe(6);
    expect(normalizeProcgenDebugDifficulty(0)).toBe(1);
    expect(normalizeProcgenDebugDifficulty(20.4)).toBe(20);
    expect(normalizeProcgenDebugDifficulty(99)).toBe(20);
    expect(procgenDebugMaxTilesForDifficulty(12)).toBe(76);
  });

  it("gates curves at 2 and ramps at 3", () => {
    expect(createProcgenDebugRequest("seed-b", 1)).toMatchObject({
      allowCurves: false,
      allowRamps: false,
    });
    expect(createProcgenDebugRequest("seed-b", 2)).toMatchObject({
      allowCurves: true,
      allowRamps: false,
    });
    expect(createProcgenDebugRequest("seed-b", 3)).toMatchObject({
      allowCurves: true,
      allowRamps: true,
    });
  });
});
