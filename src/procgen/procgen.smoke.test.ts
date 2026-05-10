import { describe, expect, it } from "vitest";
import type { GridCell } from "../level/pathGen";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { LevelGenerator } from "../level/LevelGenerator";
import { validateGeneratedMap } from "./GeneratedMapValidator";
import { mapGenerationEndpoint } from "./MapGenerationEndpoint";
import {
  enumerateProcgenFlatGridQuads,
} from "./procgenUndermapQuads";
import { deckCenterWorldFromPivot, getTileDefinition } from "./TileCatalog";

const fixedRng = () => 0.5;

function expectMapValid(
  map: ReturnType<typeof mapGenerationEndpoint.generateMap>,
): void {
  const gridPath = map.debugInfo.gridPath as GridCell[] | undefined;
  const v = validateGeneratedMap(map, gridPath);
  expect(v.ok, v.errors.join("; ")).toBe(true);
}

describe("procgen pipeline", () => {
  it("flat-height 2x2 grid block centers undermap quad (seed 1778370604878-16737912)", () => {
    const seed = "1778370604878-16737912";
    let hitTd: number | undefined;
    let map: ReturnType<typeof mapGenerationEndpoint.generateMap> | undefined;
    for (let td = 1; td <= 20; td++) {
      const m = mapGenerationEndpoint.generateMap({
        seed,
        levelIndex: td,
        targetDifficulty: td,
        maxTiles: 16 + td * 5,
        allowRamps: true,
        allowCurves: true,
      });
      const path = m.debugInfo.gridPath as GridCell[];
      const keys = new Set(
        path.map((c) => `${c.x},${c.z}`),
      );
      if (
        keys.has("1,-5") &&
        keys.has("1,-6") &&
        keys.has("2,-5") &&
        keys.has("2,-6")
      ) {
        const quads = enumerateProcgenFlatGridQuads(m);
        const q = quads.find((x) => x.anchorGx === 1 && x.anchorGz === -6);
        if (q) {
          hitTd = td;
          map = m;
          let ex = 0;
          let ez = 0;
          for (let i = 0; i < path.length; i++) {
            const c = path[i]!;
            const k = `${c.x},${c.z}`;
            if (!["1,-5", "1,-6", "2,-5", "2,-6"].includes(k)) continue;
            const t = m.tiles[i]!;
            const d = deckCenterWorldFromPivot(
              t.position,
              t.rotationY,
              getTileDefinition(t.tileType),
            );
            ex += d.x;
            ez += d.z;
          }
          ex /= 4;
          ez /= 4;
          expect(Math.hypot(q.cx - ex, q.cz - ez)).toBeLessThan(0.02);
          break;
        }
      }
    }
    expect(
      hitTd,
      "expected flat coplanar 2x2 at grid (1,-6)…(2,-5) for this seed at some difficulty",
    ).toBeDefined();
    expectMapValid(map!);
  });

  it("regression: 1778367470436-265782663 keeps start-adjacent bend inner floor and outer straight", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778367470436-265782663",
      levelIndex: 16,
      targetDifficulty: 16,
      maxTiles: 96,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    const path = map.debugInfo.gridPath as { x: number; z: number }[];
    const at10 = map.tiles.find((_, i) => path[i]?.x === 1 && path[i]?.z === 0);
    const at20 = map.tiles.find((_, i) => path[i]?.x === 2 && path[i]?.z === 0);
    expect(at10?.tileType).toBe("floor_plain");
    expect(at20?.tileType).toBe("straight_right_wall");
  });

  it("regression: 1778368836981-363528446 does not create a third start at first bend", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778368836981-363528446",
      levelIndex: 15,
      targetDifficulty: 15,
      maxTiles: 91,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    expect(map.finishKind).toBe("portal");
    expect(map.finishPortalTileIndex).toBeDefined();
    expect(map.tiles.filter((t) => t.tileType === "start_placeholder")).toHaveLength(2);
  });

  it("generateMap double_row validates and adapts", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-double-row",
      levelIndex: 5,
      targetDifficulty: 5,
      maxTiles: 41,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    expect(map.finishKind).toBe("portal");
    expect(map.finishPortalTileIndex).toBeDefined();
    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 5,
      targetDifficultyRounded: 6,
      rng: fixedRng,
    });
    expect(level.tiles.length).toBeGreaterThan(0);
    expect(level.railColliders.length).toBeGreaterThan(0);
    expect(level.finishKind).toBe("portal");
    expect(
      level.hazardSpecs.some((s) => s.kind === "portal_gate" && s.portalMode === "finish"),
    ).toBe(true);
  });

  it("double-row with ramps off yields portal gaps at high level", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-2row-portal-no-ramps",
      levelIndex: 10,
      targetDifficulty: 10,
      maxTiles: 41,
      allowRamps: false,
      allowCurves: false,
    });
    expectMapValid(map);
    expect(map.debugInfo.layout).toBe("double_row_straight");
    expect(map.finishKind).toBe("portal");
    expect(map.portalLinks?.length ?? 0).toBeGreaterThan(0);
    expect(map.tiles.some((t) => t.tileType === "dead_end_cap")).toBe(true);
    expect(map.tiles.filter((t) => t.tileType === "start_placeholder").length).toBeGreaterThanOrEqual(2);
  });

  it("double-row portal gaps may apply with curves + ramps (spinePath maps)", () => {
    let portalCurved:
      | ReturnType<typeof mapGenerationEndpoint.generateMap>
      | undefined;
    for (let i = 0; i < 160; i++) {
      const map = mapGenerationEndpoint.generateMap({
        seed: `vitest-2row-curved-portal-${i}`,
        levelIndex: 12,
        targetDifficulty: 12,
        maxTiles: 41,
        allowRamps: true,
        allowCurves: true,
      });
      if (
        map.finishKind === "portal" &&
        Array.isArray(map.debugInfo.spinePath) &&
        (map.portalLinks?.length ?? 0) > 0
      ) {
        portalCurved = map;
        break;
      }
    }
    expect(
      portalCurved,
      "expected some seed to yield curved double-row portal map",
    ).toBeDefined();
    expectMapValid(portalCurved!);
    expect(portalCurved!.tiles.some((t) => t.tileType === "dead_end_cap")).toBe(
      true,
    );
    expect(
      portalCurved!.tiles.filter((t) => t.tileType === "start_placeholder")
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("default higher-level procgen stays double-row and may use portal gaps", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-default-stays-double-row",
      levelIndex: 10,
      targetDifficulty: 10,
      maxTiles: 41,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    expect(map.debugInfo.layout).toBe("double_row_straight");
    expect(map.tiles.length % 2).toBe(0);
    expect(map.finishKind).toBe("portal");
    expect(map.finishPortalTileIndex).toBeDefined();
    expect(map.tiles.some((t) => t.tileType === "hole_placeholder")).toBe(true);
    if ((map.portalLinks?.length ?? 0) > 0) {
      expect(map.tiles.some((t) => t.tileType === "dead_end_cap")).toBe(true);
    }
  });

  it("generateMap higher single-path levels can use portal-linked gaps and finish portal", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-portal-gap",
      levelIndex: 10,
      targetDifficulty: 10,
      maxTiles: 41,
      allowRamps: true,
      allowCurves: true,
      layout: "single_path",
    });
    expectMapValid(map);
    expect(map.finishKind).toBe("portal");
    expect(map.finishPortalTileIndex).toBeDefined();
    expect(map.portalLinks?.length ?? 0).toBeGreaterThan(0);
    expect(map.tiles.some((tile) => tile.tileType === "hole_placeholder")).toBe(
      true,
    );

    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 10,
      targetDifficultyRounded: 10,
      rng: fixedRng,
    });
    expect(level.finishKind).toBe("portal");
    expect(level.hazardSpecs.every((spec) =>
      spec.kind === "portal_gate" || spec.kind === "bumper_mushroom",
    )).toBe(true);
    expect(level.hazardSpecs.some((spec) => spec.portalMode === "finish")).toBe(
      true,
    );
  });

  it("generateMap single_path validates and adapts", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "vitest-single-path",
      levelIndex: 4,
      targetDifficulty: 4,
      maxTiles: 28,
      allowRamps: true,
      allowCurves: true,
      layout: "single_path",
    });
    expectMapValid(map);
    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 4,
      targetDifficultyRounded: 5,
      rng: fixedRng,
    });
    expect(level.tiles.length).toBeGreaterThan(0);
  });

  it("portal entrance midpoint matches cardinal partner tiles (regression: dz lane pairs)", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778366324035-830060746",
      levelIndex: 10,
      targetDifficulty: 10,
      maxTiles: 41,
      allowRamps: true,
      allowCurves: true,
    });
    if (!(map.portalLinks?.length ?? 0)) return;

    const path = map.debugInfo.gridPath as GridCell[];
    const level = adaptProcgenMapToGeneratedLevel(map, {
      levelIndex: 10,
      targetDifficultyRounded: 10,
      rng: fixedRng,
    });

    const ia = path.findIndex((c) => c.x === -4 && c.z === 3);
    const ib = path.findIndex((c) => c.x === -4 && c.z === 2);
    if (
      ia < 0 ||
      ib < 0 ||
      map.tiles[ia]?.tileType !== "dead_end_cap" ||
      map.tiles[ib]?.tileType !== "dead_end_cap"
    ) {
      return;
    }

    const midX = (level.tiles[ia]!.worldX + level.tiles[ib]!.worldX) / 2;
    const midZ = (level.tiles[ia]!.worldZ + level.tiles[ib]!.worldZ) / 2;
    const specA = level.hazardSpecs.find(
      (s) => s.kind === "portal_gate" && s.portalRole === "a",
    );
    expect(specA?.portalSpawnWorldX).toBeDefined();
    expect(specA!.portalSpawnWorldX!).toBeCloseTo(midX, 3);
    expect(specA!.portalSpawnWorldZ!).toBeCloseTo(midZ, 3);
  });
});

describe("legacy LevelGenerator", () => {
  it("produces a playable level for mid tutorial index", () => {
    const gen = new LevelGenerator();
    const level = gen.generate(3, { rng: fixedRng });
    expect(level.tiles.length).toBeGreaterThan(1);
    expect(level.startPosition).toBeDefined();
    expect(level.holePosition).toBeDefined();
  });
});
