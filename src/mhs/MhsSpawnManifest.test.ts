import { describe, expect, it } from "vitest";
import { toGeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { mapGenerationEndpoint } from "../procgen/MapGenerationEndpoint";
import { createMhsSpawnManifest, createRenderWorldState } from "./MhsSpawnManifest";

describe("createMhsSpawnManifest", () => {
  it("creates prefab spawns from GeneratedLevelV1 without TileKit", () => {
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
        rng: () => 0.5,
      }),
    );

    const manifest = createMhsSpawnManifest(level);

    expect(manifest.levelId).toBe(level.id);
    expect(manifest.tiles).toHaveLength(level.tiles.length);
    expect(manifest.hazards).toHaveLength(level.hazardSpecs.length);
    expect(manifest.tiles.every((spawn) => spawn.prefab.startsWith("mhs/prefabs/"))).toBe(true);
    expect(manifest.tiles.every((spawn) => spawn.objectId.startsWith(`${level.id}:tile:`))).toBe(true);
    expect(manifest.tiles.every((spawn) => spawn.templateId === spawn.assetKey)).toBe(true);
  });

  it("projects spawn manifest data to a platform-neutral render world state", () => {
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
        rng: () => 0.5,
      }),
    );

    const state = createRenderWorldState(level);

    expect(state.levelId).toBe(level.id);
    expect(state.camera.mode).toBe("orbit");
    expect(state.objects).toHaveLength(
      level.tiles.length + level.hazardSpecs.length + level.collectibles.length,
    );
    expect(new Set(state.objects.map((object) => object.objectId)).size).toBe(
      state.objects.length,
    );
    expect(state.objects.every((object) => object.templateId.length > 0)).toBe(true);
    expect(state.objects.every((object) => object.replication === "sharedGameplay")).toBe(true);
  });
});
