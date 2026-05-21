import { describe, expect, it } from "vitest";
import { procgenGameplayConfig } from "../core/PlayableLevelService";
import { toGeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { LANE_WIDTH, TILE_SIZE } from "../level/TileDimensions";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import { createProcgenDebugRequest } from "../procgen/procgenDebugRequest";
import { createProcgenCourseSpawnV1 } from "./ProcgenCourseSpawnV1";
import {
  createProcgenCourseSpawnFromGeneratedMap,
  createRuntimeGameplayProcgenCourse,
  createRuntimeProcgenCourse,
  runtimeGameplayProcgenConfig,
} from "../../../putt_realms/scripts/puttrealms/procgen/RuntimeProcgenCourse";
import { mapGenerationEndpoint as mhsMapGenerationEndpoint } from "../../../putt_realms/scripts/puttrealms/procgen/MapGenerationEndpoint";
import { mhsRailColliderYBand } from "../../../putt_realms/scripts/puttrealms/gameplay/MhsBallPhysics";
import type {
  ProcgenCourseSpawnV1,
  ProcgenDecorAssetKeyV1,
  ProcgenDecorSpawnV1,
  ProcgenTileSpawnV1,
  ProcgenUndermapIslandSlotV1,
} from "../../../putt_realms/scripts/puttrealms/procgen/ProcgenCourseSpawnTypes";

const ISLAND_SURFACE_BIAS_Y = -0.12;
const DECOR_GROUND_PENETRATION_Y = 0.38;
const DECOR_DISK_CLEARANCE = 1.26;
const ISLAND_DECOR_SQUARE_HALF_MUL = 0.6;
const DECK_EXCLUDE_R = Math.hypot(TILE_SIZE / 2, LANE_WIDTH / 2) + 1.8;

function fixedRng(): number {
  return 0.5;
}

function createWebCourse(seed: string, difficulty: number) {
  const request = createProcgenDebugRequest(seed, difficulty);
  const map = mapGenerationEndpoint.generateMap(request);
  const level = toGeneratedLevelV1(
    adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: request.levelIndex,
      targetDifficultyRounded: request.targetDifficulty,
      rng: fixedRng,
    }),
  );
  return {
    request,
    course: createProcgenCourseSpawnV1(level),
  };
}

function createWebGameplayCourse(seedOverride: string, gameplayLevel: number) {
  const config = procgenGameplayConfig(gameplayLevel);
  const request = {
    seed: seedOverride,
    levelIndex: gameplayLevel,
    targetDifficulty: config.progressionLevel,
    maxTiles: config.maxTiles,
    allowRamps: config.allowRamps,
    allowCurves: config.allowCurves,
  };
  const map = mapGenerationEndpoint.generateMap(request);
  const level = toGeneratedLevelV1(
    adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: request.levelIndex,
      targetDifficultyRounded: config.displayTargetDifficulty,
      rng: fixedRng,
    }),
  );
  return {
    config,
    request,
    course: createProcgenCourseSpawnV1(level),
  };
}

function withoutReplay<T extends { replay?: unknown }>(course: T): Omit<T, "replay"> {
  const { replay: _replay, ...rest } = course;
  return rest;
}

function expectedMhsRuntimeDto(
  webCourse: ReturnType<typeof createWebCourse>["course"],
  actualCourse: ProcgenCourseSpawnV1,
) {
  return {
    ...webCourse,
    isTutorial: actualCourse.isTutorial,
    railColliders: actualCourse.railColliders,
    hazards: actualCourse.hazards ?? [],
    undermapSlots: actualCourse.undermapSlots ?? [],
    decorSpawns: actualCourse.decorSpawns ?? [],
  };
}

function islandDecorSquareHalfExtent(slot: ProcgenUndermapIslandSlotV1): number {
  return slot.halfWidthWorld * ISLAND_DECOR_SQUARE_HALF_MUL;
}

function minDistSqToTiles(
  x: number,
  z: number,
  tiles: readonly ProcgenTileSpawnV1[],
): number {
  let best = Infinity;
  for (const tile of tiles) {
    const dx = x - tile.position.x;
    const dz = z - tile.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

function islandsOnlyMinDistFromDecks(
  key: ProcgenDecorAssetKeyV1,
  propRadiusXZ: number,
): number {
  const canopy = propRadiusXZ * (key === "decor_fantasy_pine_tree" ? 1.12 : 1.02);
  const pad = key === "decor_fantasy_pine_tree" ? 0.68 : 0.2;
  return DECK_EXCLUDE_R + canopy + pad;
}

function maxDeckClearanceFeasibleOnSlot(slot: ProcgenUndermapIslandSlotV1): number {
  return slot.halfWidthWorld * 0.82 + TILE_SIZE * 0.25;
}

function clampDeckClearanceForIslandDecor(
  requestedMinDist: number,
  slot: ProcgenUndermapIslandSlotV1,
): number {
  const h = islandDecorSquareHalfExtent(slot);
  const cap = Math.max(TILE_SIZE * 0.56 + 0.48, h * 0.6 + 0.58);
  return Math.min(requestedMinDist, cap);
}

function cappedDeckClearance(
  decor: ProcgenDecorSpawnV1,
  slot: ProcgenUndermapIslandSlotV1,
): number {
  return clampDeckClearanceForIslandDecor(
    Math.min(
      islandsOnlyMinDistFromDecks(decor.assetKey, decor.footprintRadius),
      maxDeckClearanceFeasibleOnSlot(slot),
    ),
    slot,
  );
}

function assertDecorPlacement(course: ProcgenCourseSpawnV1): void {
  const slots = course.undermapSlots ?? [];
  const decorSpawns = course.decorSpawns ?? [];
  expect(slots.length).toBeGreaterThan(0);
  expect(decorSpawns.length).toBeGreaterThan(0);

  for (const decor of decorSpawns) {
    const slot = slots[decor.slotIndex];
    expect(slot).toBeDefined();
    const h = islandDecorSquareHalfExtent(slot);
    expect(Number.isFinite(decor.position.x)).toBe(true);
    expect(Number.isFinite(decor.position.y)).toBe(true);
    expect(Number.isFinite(decor.position.z)).toBe(true);
    expect(Math.abs(decor.position.x - slot.x)).toBeLessThanOrEqual(h + 1e-6);
    expect(Math.abs(decor.position.z - slot.z)).toBeLessThanOrEqual(h + 1e-6);
    expect(decor.position.y).toBeCloseTo(
      slot.topY + ISLAND_SURFACE_BIAS_Y - DECOR_GROUND_PENETRATION_Y,
      6,
    );
    expect(decor.scale).toBeCloseTo(decor.targetHeight * 100, 6);
    expect(minDistSqToTiles(decor.position.x, decor.position.z, course.tiles)).toBeGreaterThanOrEqual(
      cappedDeckClearance(decor, slot) ** 2 - 1e-6,
    );
  }

  for (let i = 0; i < decorSpawns.length; i++) {
    for (let j = i + 1; j < decorSpawns.length; j++) {
      const a = decorSpawns[i]!;
      const b = decorSpawns[j]!;
      const dx = a.position.x - b.position.x;
      const dz = a.position.z - b.position.z;
      const minSep = a.footprintRadius + b.footprintRadius + DECOR_DISK_CLEARANCE;
      expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(minSep * minSep - 1e-6);
    }
  }
}

describe("MHS runtime procgen parity", () => {
  const cases = [
    { seed: "vitest-mhs-deck-straight", difficulty: 5 },
    { seed: "1778813885962-390489452", difficulty: 2 },
    { seed: "1778813885962-390489452", difficulty: 6 },
    { seed: "1778371769655-643338418", difficulty: 17 },
    { seed: "putt-16-v2-91de0972-99ec-463d-8b79-d585caef725a", difficulty: 20 },
  ];

  it.each([1, 2, 3, 16, 17, 20, 21])(
    "matches HTML gameplay progression config for hole %i",
    (gameplayLevel) => {
      expect(runtimeGameplayProcgenConfig(gameplayLevel)).toEqual(
        procgenGameplayConfig(gameplayLevel),
      );
    },
  );

  it.each(cases)(
    "matches the HTML spawn DTO for $seed at difficulty $difficulty",
    ({ seed, difficulty }) => {
      const expected = createWebCourse(seed, difficulty);
      const actual = createRuntimeProcgenCourse(seed, difficulty);

      expect(withoutReplay(actual.course)).toEqual(
        expectedMhsRuntimeDto(expected.course, actual.course),
      );
      expect(actual.course.replay).toEqual({
        seed: expected.request.seed,
        difficulty: expected.request.targetDifficulty,
        levelIndex: expected.request.levelIndex,
        targetDifficulty: expected.request.targetDifficulty,
        maxTiles: expected.request.maxTiles,
        allowRamps: expected.request.allowRamps,
        allowCurves: expected.request.allowCurves,
      });
    },
  );

  it.each([1, 2, 10, 17, 21])(
    "matches the HTML gameplay spawn DTO for fixed seed override at hole %i",
    (gameplayLevel) => {
      const seedOverride = "vitest-fixed-gameplay-seed";
      const expected = createWebGameplayCourse(seedOverride, gameplayLevel);
      const actual = createRuntimeGameplayProcgenCourse({
        seedOverride,
        gameplayLevel,
        layoutSalt: "unused-when-seed-override-exists",
      });

      expect(actual.config).toEqual(expected.config);
      expect(actual.request).toEqual(expected.request);
      expect(withoutReplay(actual.course)).toEqual(
        expectedMhsRuntimeDto(expected.course, actual.course),
      );
      expect(actual.course.replay).toEqual({
        seed: expected.request.seed,
        difficulty: expected.config.displayTargetDifficulty,
        levelIndex: expected.request.levelIndex,
        targetDifficulty: expected.request.targetDifficulty,
        maxTiles: expected.request.maxTiles,
        allowRamps: expected.request.allowRamps,
        allowCurves: expected.request.allowCurves,
      });
    },
  );

  it("uses HTML-style per-hole seeds when no fixed seed override is provided", () => {
    const actual = createRuntimeGameplayProcgenCourse({
      seedOverride: "",
      gameplayLevel: 7,
      layoutSalt: "vitest-layout-salt",
    });

    expect(actual.request.seed).toBe("putt-7-v2-vitest-layout-salt");
    expect(actual.request.levelIndex).toBe(7);
    expect(actual.request.targetDifficulty).toBe(
      procgenGameplayConfig(7).progressionLevel,
    );
  });

  it("marks the first gameplay course as tutorial and injects one FTUE mushroom", () => {
    const actual = createRuntimeGameplayProcgenCourse({
      seedOverride: "vitest-ftue-tutorial",
      gameplayLevel: 1,
      layoutSalt: "unused-when-seed-override-exists",
    }).course;
    const ftueHazards = (actual.hazards ?? []).filter((hazard) =>
      hazard.id.startsWith("ftue-mushroom-"),
    );

    expect(actual.isTutorial).toBe(true);
    expect(ftueHazards).toHaveLength(1);
    expect(ftueHazards[0]).toMatchObject({
      kind: "bumper_mushroom",
      assetKey: "hazard_bumper_mushroom",
      visualScale: 1.15,
    });
  });

  it("does not inject the FTUE mushroom on non-tutorial gameplay courses", () => {
    const actual = createRuntimeGameplayProcgenCourse({
      seedOverride: "vitest-ftue-not-tutorial",
      gameplayLevel: 2,
      layoutSalt: "unused-when-seed-override-exists",
    }).course;

    expect(actual.isTutorial).toBe(false);
    expect((actual.hazards ?? []).some((hazard) => hazard.id.startsWith("ftue-mushroom-"))).toBe(false);
  });

  it("skips portal-reserved tiles when injecting the FTUE mushroom", () => {
    const request = {
      seed: "vitest-ftue-reserved",
      levelIndex: 1,
      targetDifficulty: 0,
      maxTiles: 16,
      allowRamps: false,
      allowCurves: false,
    };
    const map = mhsMapGenerationEndpoint.generateMap(request);
    const baseline = createProcgenCourseSpawnFromGeneratedMap(map, request, 0);
    const originalFtue = (baseline.hazards ?? []).find((hazard) =>
      hazard.id.startsWith("ftue-mushroom-"),
    );
    expect(originalFtue).toBeDefined();
    const reservePartner = baseline.tiles.find(
      (tile) =>
        tile.tileIndex !== originalFtue!.tileIndex &&
        tile.tileType !== "straight",
    );
    expect(reservePartner).toBeDefined();

    const reserved = createProcgenCourseSpawnFromGeneratedMap(
      {
        ...map,
        portalLinks: [
          {
            id: "reserve-original-ftue",
            fromTileIndex: originalFtue!.tileIndex,
            toTileIndex: reservePartner!.tileIndex,
          },
        ],
      },
      request,
      0,
    );
    const reservedFtue = (reserved.hazards ?? []).find((hazard) =>
      hazard.id.startsWith("ftue-mushroom-"),
    );

    expect(reserved.isTutorial).toBe(true);
    expect(reservedFtue).toBeDefined();
    expect(reservedFtue!.tileIndex).not.toBe(originalFtue!.tileIndex);
    expect(reservedFtue!.tileIndex).not.toBe(reservePartner!.tileIndex);
    expect(reservedFtue!.kind).toBe("bumper_mushroom");
  });

  it("generates deterministic island decor on valid undermap slots", () => {
    const seed = "putt-16-v2-91de0972-99ec-463d-8b79-d585caef725a";
    const difficulty = 20;
    const first = createRuntimeProcgenCourse(seed, difficulty).course;
    const second = createRuntimeProcgenCourse(seed, difficulty).course;

    expect(first.decorSpawns).toEqual(second.decorSpawns);
    for (const decor of first.decorSpawns ?? []) {
      expect(first.undermapSlots?.[decor.slotIndex]).toBeDefined();
    }
  });

  it("keeps rail collider XZ parity while using lobbable MHS height bands", () => {
    for (const { seed, difficulty } of cases) {
      const expected = createWebCourse(seed, difficulty).course;
      const actual = createRuntimeProcgenCourse(seed, difficulty).course;

      expect(actual.railColliders).toHaveLength(expected.railColliders.length);
      for (let i = 0; i < actual.railColliders.length; i++) {
        const actualRail = actual.railColliders[i]!;
        const expectedRail = expected.railColliders[i]!;
        expect({
          ax: actualRail.ax,
          az: actualRail.az,
          bx: actualRail.bx,
          bz: actualRail.bz,
        }).toEqual({
          ax: expectedRail.ax,
          az: expectedRail.az,
          bx: expectedRail.bx,
          bz: expectedRail.bz,
        });
        const deckY = (actualRail.yMin ?? 0) - mhsRailColliderYBand(0).yMin;
        const expectedBand = mhsRailColliderYBand(deckY);
        expect(actualRail.yMin).toBeCloseTo(expectedBand.yMin, 6);
        expect(actualRail.yMax).toBeCloseTo(expectedBand.yMax, 6);
      }
    }
  });

  it("keeps island decor finite, on-slot, deck-clear, and mutually spaced", () => {
    for (const { seed, difficulty } of cases) {
      assertDecorPlacement(createRuntimeProcgenCourse(seed, difficulty).course);
    }
  });
});
