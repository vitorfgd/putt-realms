import { toGeneratedLevelV1, type GeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import type { GenerateMapRequest } from "../procgen/MapGenerationTypes";
import {
  createProcgenCourseSpawnV1,
  type ProcgenCourseSpawnV1,
} from "./ProcgenCourseSpawnV1";

export interface ProcgenCourseSpawnFixtureCase {
  name: string;
  request: GenerateMapRequest;
  expectations: {
    hasRamp: boolean;
    finishKind?: "hole" | "portal";
  };
}

export interface ProcgenCourseSpawnFixture {
  fixture: ProcgenCourseSpawnFixtureCase;
  level: GeneratedLevelV1;
  course: ProcgenCourseSpawnV1;
}

export interface ProcgenCourseSpawnFixtureSummary {
  name: string;
  tileCount: number;
  surfacePatchCount: number;
  railColliderCount: number;
  templateIds: string[];
  rampTileCount: number;
  finishKind?: "hole" | "portal";
}

export const PROCGEN_COURSE_SPAWN_FIXTURE_CASES: readonly ProcgenCourseSpawnFixtureCase[] = [
  {
    name: "straight-double-row",
    request: {
      seed: "vitest-mhs-deck-straight",
      levelIndex: 5,
      targetDifficulty: 5,
      maxTiles: 46,
      allowRamps: false,
      allowCurves: false,
    },
    expectations: { hasRamp: false },
  },
  {
    name: "curved-double-row",
    request: {
      seed: "1778813885962-390489452",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 46,
      allowRamps: true,
      allowCurves: true,
    },
    expectations: { hasRamp: false },
  },
  {
    name: "ramp-heavy-double-row",
    request: {
      seed: "putt-16-v2-91de0972-99ec-463d-8b79-d585caef725a",
      levelIndex: 20,
      targetDifficulty: 20,
      maxTiles: 116,
      allowRamps: true,
      allowCurves: true,
    },
    expectations: { hasRamp: true },
  },
  {
    name: "portal-gap-double-row",
    request: {
      seed: "1778371769655-643338418",
      levelIndex: 17,
      targetDifficulty: 17,
      maxTiles: 116,
      allowRamps: true,
      allowCurves: true,
    },
    expectations: { hasRamp: true, finishKind: "hole" },
  },
] as const;

function fixedFixtureRng(): number {
  return 0.5;
}

export function createProcgenCourseSpawnFixture(
  fixture: ProcgenCourseSpawnFixtureCase,
): ProcgenCourseSpawnFixture {
  const map = mapGenerationEndpoint.generateMap(fixture.request);
  const level = toGeneratedLevelV1(
    adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: fixture.request.levelIndex,
      targetDifficultyRounded: fixture.request.targetDifficulty,
      rng: fixedFixtureRng,
    }),
  );
  return {
    fixture,
    level,
    course: createProcgenCourseSpawnV1(level),
  };
}

export function summarizeProcgenCourseSpawnFixture(
  fixture: ProcgenCourseSpawnFixture,
): ProcgenCourseSpawnFixtureSummary {
  return {
    name: fixture.fixture.name,
    tileCount: fixture.course.tiles.length,
    surfacePatchCount: fixture.course.surfacePatches.length,
    railColliderCount: fixture.course.railColliders.length,
    templateIds: fixture.course.templateCalibrations.map(
      (calibration) => calibration.templateId,
    ),
    rampTileCount: fixture.course.tiles.filter((tile) => tile.isRamp).length,
    ...(fixture.course.finishKind ? { finishKind: fixture.course.finishKind } : {}),
  };
}
