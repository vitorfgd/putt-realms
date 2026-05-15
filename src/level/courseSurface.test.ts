import { describe, expect, it } from "vitest";
import {
  flatProcgenPatch,
  rampProcgenPatch,
  sampleCourseSurface,
} from "./courseSurface";
import type { CourseSurface } from "./LevelTypes";
import { RAMP_HEIGHT, TILE_LENGTH } from "../procgen/TileCatalog";

describe("courseSurface", () => {
  it("returns null when no patch supports the point", () => {
    const surface: CourseSurface = {
      patches: [flatProcgenPatch(0, 0, 0, 0)],
    };

    expect(sampleCourseSurface(undefined, 0, 0)).toBeNull();
    expect(sampleCourseSurface(surface, 99, 99)).toBeNull();
  });

  it("samples flat patches by highest supported deck", () => {
    const surface: CourseSurface = {
      patches: [
        flatProcgenPatch(0, 0, 0, 0),
        flatProcgenPatch(0, 0, 2, 0),
      ],
    };

    const sample = sampleCourseSurface(surface, 0.5, 0.5);
    expect(sample?.y).toBe(2);
    expect(sample?.normalY).toBe(1);
    expect(sample?.gradX).toBe(0);
    expect(sample?.gradZ).toBe(0);
  });

  it("interpolates ramp height from local back to local front", () => {
    const surface: CourseSurface = {
      patches: [rampProcgenPatch(0, 0, 1, 0)],
    };

    expect(sampleCourseSurface(surface, 0, -TILE_LENGTH / 2)?.y).toBeCloseTo(1);
    expect(sampleCourseSurface(surface, 0, 0)?.y).toBeCloseTo(1 + RAMP_HEIGHT / 2);
    expect(sampleCourseSurface(surface, 0, TILE_LENGTH / 2)?.y).toBeCloseTo(1 + RAMP_HEIGHT);
    expect(sampleCourseSurface(surface, 0, 0)?.gradZ).toBeGreaterThan(0);
  });

  it("rotates ramp sampling and gradient with patch yaw", () => {
    const surface: CourseSurface = {
      patches: [rampProcgenPatch(0, 0, 0, Math.PI / 2)],
    };

    expect(sampleCourseSurface(surface, -TILE_LENGTH / 2, 0)?.y).toBeCloseTo(0);
    expect(sampleCourseSurface(surface, TILE_LENGTH / 2, 0)?.y).toBeCloseTo(RAMP_HEIGHT);
    expect(sampleCourseSurface(surface, 0, 0)?.gradX).toBeGreaterThan(0);
    expect(Math.abs(sampleCourseSurface(surface, 0, 0)?.gradZ ?? 1)).toBeLessThan(1e-6);
  });
});
