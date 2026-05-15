import { describe, expect, it } from "vitest";
import type { GridCell } from "../level/pathGen";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { sampleCourseSurface } from "../level/courseSurface";
import { mapGenerationEndpoint } from "./MapGenerationEndpoint";
import { validateGeneratedMap } from "./GeneratedMapValidator";
import {
  DOUBLE_ROW_SIDE_GAP,
  TILE_LENGTH,
  TILE_WIDTH,
  deckCenterWorldFromPivot,
  getTileDefinition,
} from "./TileCatalog";

function fixedRng(): number {
  return 0.5;
}

describe("procgen placement contracts", () => {
  it("keeps the recent z-fight seed on a 2x2 grass-base grid", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778813885962-390489452",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 16 + 6 * 5,
      allowRamps: true,
      allowCurves: true,
    });
    const path = map.debugInfo.gridPath as GridCell[];
    const validation = validateGeneratedMap(map, path);
    expect(validation.ok, validation.errors.join("; ")).toBe(true);
    expect(TILE_WIDTH).toBe(TILE_LENGTH);
    expect(DOUBLE_ROW_SIDE_GAP).toBe(0);

    const decks = map.tiles.map((tile) =>
      deckCenterWorldFromPivot(
        tile.position,
        tile.rotationY,
        getTileDefinition(tile.tileType),
      ),
    );

    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        const sameDeck =
          Math.hypot(decks[i]!.x - decks[j]!.x, decks[i]!.z - decks[j]!.z) < 0.01 &&
          Math.abs(decks[i]!.y - decks[j]!.y) < 0.01;
        expect(sameDeck, `duplicate deck center at tile ${i}/${j}`).toBe(false);

        const gridAdjacent =
          Math.abs(path[i]!.x - path[j]!.x) + Math.abs(path[i]!.z - path[j]!.z) === 1;
        if (gridAdjacent && Math.abs(decks[i]!.y - decks[j]!.y) < 0.01) {
          expect(
            Math.hypot(decks[i]!.x - decks[j]!.x, decks[i]!.z - decks[j]!.z),
            `bad grass-base spacing between tile ${i}/${j}`,
          ).toBeCloseTo(TILE_LENGTH, 4);
        }
      }
    }
  });

  it("adapts procgen output into the strict MHS-facing runtime boundary", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778813885962-390489452",
      levelIndex: 6,
      targetDifficulty: 6,
      maxTiles: 16 + 6 * 5,
      allowRamps: true,
      allowCurves: true,
    });

    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 6,
      targetDifficultyRounded: 6,
      rng: fixedRng,
    });

    expect(level.tiles.length).toBe(map.tiles.length);
    expect(level.surface.patches.length).toBeGreaterThanOrEqual(level.tiles.length);
    expect(level.railColliders.length).toBeGreaterThan(0);
    expect(level.procgenDebugInfo).toBeDefined();
    expect(level.procgenSourceMap).toBe(map);
  });

  it("records imperfect difficulty when generation cannot closely match the target", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-imperfect-difficulty-contract",
      levelIndex: 22,
      targetDifficulty: 10,
      maxTiles: 4,
      allowRamps: false,
      allowCurves: false,
    });

    expect(map.imperfectDifficulty).toBe(true);
    expect(map.debugInfo.matchedWithinOne).toBe(false);
  });

  it("exposes world rail sides and ramp surface support through the adapter", () => {
    let adapted:
      | ReturnType<typeof adaptProcgenMapToGeneratedLevel>
      | undefined;
    for (let i = 0; i < 80; i++) {
      const map = mapGenerationEndpoint.generateMap({
        seed: `vitest-ramp-rail-contract-${i}`,
        levelIndex: 8,
        targetDifficulty: 8,
        maxTiles: 56,
        allowRamps: true,
        allowCurves: true,
      });
      const level = adaptProcgenMapToGeneratedLevel(map, {
        levelIndex: 8,
        targetDifficultyRounded: 8,
        rng: fixedRng,
      });
      if (
        level.tiles.some((tile) => (tile.railWorldSides?.length ?? 0) > 0) &&
        level.tiles.some((tile) => tile.isRamp)
      ) {
        adapted = level;
        break;
      }
    }

    expect(adapted, "expected a seeded map with ramps and exposed rails").toBeDefined();
    const ramp = adapted!.tiles.find((tile) => tile.isRamp)!;
    expect(ramp.hazardSafe).toBe(false);
    expect(sampleCourseSurface(adapted!.surface, ramp.worldX, ramp.worldZ)?.patch.kind).toBe("ramp");
    expect(adapted!.railColliders.length).toBeGreaterThan(0);
  });
});
