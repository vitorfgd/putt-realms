import { describe, expect, it } from "vitest";
import { toGeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import { MHS_PREFAB_REGISTRY } from "./PrefabRegistry";
import {
  PROCGEN_COURSE_SPAWN_FIXTURE_CASES,
  createProcgenCourseSpawnFixture,
  summarizeProcgenCourseSpawnFixture,
} from "./ProcgenCourseSpawnFixtures";
import {
  PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID,
  PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM,
  PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY,
  assertProcgenCourseSpawnV1,
  createProcgenCourseSpawnV1,
  type ProcgenCourseSpawnV1,
} from "./ProcgenCourseSpawnV1";

function fixedRng(): number {
  return 0.5;
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

describe("ProcgenCourseSpawnV1", () => {
  it("projects the MHS first slice without debug, hazards, or collectibles", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778813885962-390489452",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 46,
      allowRamps: true,
      allowCurves: true,
    });
    const level = toGeneratedLevelV1(
      adaptProcgenMapToGeneratedLevel(map, {
        levelIndex: 6,
        targetDifficultyRounded: 6,
        rng: fixedRng,
      }),
    );

    const course = createProcgenCourseSpawnV1(level);
    const raw = course as unknown as Record<string, unknown>;

    expect(course.schemaId).toBe(PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID);
    expect(course.coordinateSystem).toEqual(PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM);
    expect(course.spawnPolicy).toEqual(PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY);
    expect(course.spawnPolicy.requiresAssetPivotMathInSpawner).toBe(false);
    expect(course.tiles).toHaveLength(level.tiles.length);
    expect(course.surfacePatches.length).toBeGreaterThanOrEqual(course.tiles.length);
    expect(course.railColliders.length).toBeGreaterThan(0);
    expect(course.templateCalibrations.length).toBeGreaterThan(0);
    expect("procgenDebugInfo" in raw).toBe(false);
    expect("procgenSourceMap" in raw).toBe(false);
    expect("hazardSpecs" in raw).toBe(false);
    expect("collectibles" in raw).toBe(false);
  });

  it("emits finite deck-center tile spawns with valid template keys and aligned surface patches", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "putt-16-v2-91de0972-99ec-463d-8b79-d585caef725a",
      levelIndex: 20,
      targetDifficulty: 20,
      maxTiles: 116,
      allowRamps: true,
      allowCurves: true,
    });
    const level = toGeneratedLevelV1(
      adaptProcgenMapToGeneratedLevel(map, {
        levelIndex: 20,
        targetDifficultyRounded: 20,
        rng: fixedRng,
      }),
    );

    const course = createProcgenCourseSpawnV1(level);

    expect(course.tiles.some((tile) => tile.isRamp)).toBe(true);
    for (const tile of course.tiles) {
      expect(MHS_PREFAB_REGISTRY[tile.assetKey]).toBeDefined();
      expect(MHS_PREFAB_REGISTRY[tile.assetKey].pivotPolicy).toBe("deck-center");
      expect(MHS_PREFAB_REGISTRY[tile.assetKey].debugOnly).toBe(false);
      expect(tile.templateId).toBe(tile.assetKey);
      expect(finite(tile.position.x)).toBe(true);
      expect(finite(tile.position.y)).toBe(true);
      expect(finite(tile.position.z)).toBe(true);
      expect(finite(tile.rotationY)).toBe(true);

      const levelTile = level.tiles[tile.tileIndex]!;
      expect(tile.position.x).toBeCloseTo(levelTile.worldX, 5);
      expect(tile.position.y).toBeCloseTo(levelTile.worldY ?? 0, 5);
      expect(tile.position.z).toBeCloseTo(levelTile.worldZ, 5);
      expect(tile.surfacePatchIndex).toBe(tile.tileIndex);
      expect(course.surfacePatches[tile.surfacePatchIndex]).toBeDefined();
    }

    const calibrationIds = new Set(
      course.templateCalibrations.map((calibration) => calibration.templateId),
    );
    for (const tile of course.tiles) {
      expect(calibrationIds.has(tile.templateId)).toBe(true);
    }
    for (const calibration of course.templateCalibrations) {
      expect(calibration.rootPolicy).toBe("deck-center");
      expect(calibration.entityRootPosition).toBe("tiles[].position");
      expect(calibration.entityRootYaw).toBe("tiles[].rotationY");
      expect(calibration.visualCorrectionOwner).toBe("template-child");
      expect(calibration.requiredChildNames).toEqual(
        MHS_PREFAB_REGISTRY[calibration.templateId].requiredChildNames,
      );
    }

    for (const rail of course.railColliders) {
      expect(finite(rail.ax)).toBe(true);
      expect(finite(rail.az)).toBe(true);
      expect(finite(rail.bx)).toBe(true);
      expect(finite(rail.bz)).toBe(true);
      expect(Math.hypot(rail.bx - rail.ax, rail.bz - rail.az)).toBeGreaterThan(0);
    }
  });

  it("keeps canonical MHS fixtures deterministic and JSON-safe", () => {
    for (const fixtureCase of PROCGEN_COURSE_SPAWN_FIXTURE_CASES) {
      const first = createProcgenCourseSpawnFixture(fixtureCase);
      const second = createProcgenCourseSpawnFixture(fixtureCase);
      const summary = summarizeProcgenCourseSpawnFixture(first);

      expect(JSON.stringify(first.course)).toBe(JSON.stringify(second.course));
      expect(summary.tileCount).toBeGreaterThan(0);
      expect(summary.surfacePatchCount).toBeGreaterThanOrEqual(summary.tileCount);
      expect(summary.railColliderCount).toBeGreaterThan(0);
      expect(summary.templateIds.length).toBeGreaterThan(0);
      expect(summary.rampTileCount > 0).toBe(fixtureCase.expectations.hasRamp);
      if (fixtureCase.expectations.finishKind) {
        expect(summary.finishKind).toBe(fixtureCase.expectations.finishKind);
      }

      const roundTrip = JSON.parse(JSON.stringify(first.course)) as ProcgenCourseSpawnV1;
      assertProcgenCourseSpawnV1(roundTrip);
    }
  });
});
