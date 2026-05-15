import { describe, expect, it } from "vitest";
import {
  GENERATED_LEVEL_V1_SCHEMA_ID,
  assertGeneratedLevelV1,
  toGeneratedLevelV1,
} from "./GeneratedLevelV1";
import { adaptProcgenMapToGeneratedLevel } from "./procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";

describe("GeneratedLevelV1", () => {
  it("projects gameplay levels without debug-only procgen payloads", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778813885962-390489452",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 46,
      allowRamps: true,
      allowCurves: true,
    });
    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 6,
      targetDifficultyRounded: 6,
      rng: () => 0.5,
    });
    const v1 = toGeneratedLevelV1(level);

    assertGeneratedLevelV1(v1);
    expect(v1.schemaId).toBe(GENERATED_LEVEL_V1_SCHEMA_ID);
    expect("procgenDebugInfo" in v1).toBe(false);
    expect("procgenSourceMap" in v1).toBe(false);
    expect(v1.tiles).not.toBe(level.tiles);
    expect(v1.surface.patches).not.toBe(level.surface.patches);
  });
});
