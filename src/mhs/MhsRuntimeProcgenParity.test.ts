import { describe, expect, it } from "vitest";
import { toGeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import { createProcgenDebugRequest } from "../procgen/procgenDebugRequest";
import { createProcgenCourseSpawnV1 } from "./ProcgenCourseSpawnV1";
import {
  createRuntimeProcgenCourse,
} from "../../../putt_realms/scripts/puttrealms/procgen/RuntimeProcgenCourse";

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

function withoutReplay<T extends { replay?: unknown }>(course: T): Omit<T, "replay"> {
  const { replay: _replay, ...rest } = course;
  return rest;
}

describe("MHS runtime procgen parity", () => {
  const cases = [
    { seed: "vitest-mhs-deck-straight", difficulty: 5 },
    { seed: "1778813885962-390489452", difficulty: 2 },
    { seed: "1778813885962-390489452", difficulty: 6 },
    { seed: "1778371769655-643338418", difficulty: 17 },
    { seed: "putt-16-v2-91de0972-99ec-463d-8b79-d585caef725a", difficulty: 20 },
  ];

  it.each(cases)(
    "matches the HTML spawn DTO for $seed at difficulty $difficulty",
    ({ seed, difficulty }) => {
      const expected = createWebCourse(seed, difficulty);
      const actual = createRuntimeProcgenCourse(seed, difficulty);

      expect(withoutReplay(actual.course)).toEqual(expected.course);
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
});
