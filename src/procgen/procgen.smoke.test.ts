import { describe, expect, it } from "vitest";
import type { GridCell } from "../level/pathGen";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { LevelGenerator } from "../level/LevelGenerator";
import {
  MIN_GRID_SEP_PORTAL_RUNS,
  validateGeneratedMap,
} from "./GeneratedMapValidator";
import { mapGenerationEndpoint } from "./MapGenerationEndpoint";
import {
  countMisclassifiedInteriorFloorPlain,
  travelIntoStation,
} from "./TilePlacementSolver";
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
  it("flat-height 2×2 procgen quads match mean deck centers", () => {
    let map: ReturnType<typeof mapGenerationEndpoint.generateMap> | undefined;
    let quad: ReturnType<typeof enumerateProcgenFlatGridQuads>[number] | undefined;
    for (let td = 4; td <= 22; td++) {
      const m = mapGenerationEndpoint.generateMap({
        seed: "vitest-flat-quad-centers",
        levelIndex: td,
        targetDifficulty: td,
        maxTiles: 16 + td * 5,
        allowRamps: true,
        allowCurves: true,
      });
      const path = m.debugInfo.gridPath as GridCell[];
      if (!validateGeneratedMap(m, path).ok) continue;
      const quads = enumerateProcgenFlatGridQuads(m);
      if (quads.length === 0) continue;
      map = m;
      quad = quads[0]!;
      break;
    }
    expect(map, "expected some difficulty to yield a coplanar 2×2 quad").toBeDefined();
    expectMapValid(map!);
    const path = map!.debugInfo.gridPath as GridCell[];
    const q = quad!;
    let ex = 0;
    let ez = 0;
    let n = 0;
    const corners = [
      `${q.anchorGx},${q.anchorGz}`,
      `${q.anchorGx + 1},${q.anchorGz}`,
      `${q.anchorGx},${q.anchorGz + 1}`,
      `${q.anchorGx + 1},${q.anchorGz + 1}`,
    ];
    for (let i = 0; i < path.length; i++) {
      const k = `${path[i]!.x},${path[i]!.z}`;
      if (!corners.includes(k)) continue;
      const t = map!.tiles[i]!;
      const d = deckCenterWorldFromPivot(
        t.position,
        t.rotationY,
        getTileDefinition(t.tileType),
      );
      ex += d.x;
      ez += d.z;
      n++;
    }
    expect(n).toBe(4);
    ex /= 4;
    ez /= 4;
    expect(Math.hypot(q.cx - ex, q.cz - ez)).toBeLessThan(0.02);
  });

  it("curved double-row portal gaps shift grid so consecutive runs are Chebyshev-separated (1778371769655-643338418 td=17)", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778371769655-643338418",
      levelIndex: 17,
      targetDifficulty: 17,
      maxTiles: 16 + 17 * 5,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    expect(map.portalLinks?.length ?? 0).toBeGreaterThan(0);
    expect(Array.isArray(map.debugInfo.spinePath)).toBe(true);

    const path = map.debugInfo.gridPath as GridCell[];
    const sorted = [...map.portalLinks!].sort(
      (a, b) => a.toTileIndex - b.toTileIndex,
    );
    const runs: [number, number][] = [];
    runs.push([0, sorted[0]!.fromTileIndex]);
    for (let gi = 0; gi < sorted.length - 1; gi++) {
      runs.push([
        sorted[gi]!.toTileIndex,
        sorted[gi + 1]!.fromTileIndex,
      ]);
    }
    runs.push([
      sorted[sorted.length - 1]!.toTileIndex,
      path.length - 1,
    ]);

    for (let ri = 0; ri < runs.length - 1; ri++) {
      const [a0, a1] = runs[ri]!;
      const [b0, b1] = runs[ri + 1]!;
      let minSep = Infinity;
      for (let p = a0; p <= a1; p++) {
        for (let q = b0; q <= b1; q++) {
          const d = Math.max(
            Math.abs(path[p]!.x - path[q]!.x),
            Math.abs(path[p]!.z - path[q]!.z),
          );
          if (d < minSep) minSep = d;
        }
      }
      expect(minSep).toBeGreaterThanOrEqual(MIN_GRID_SEP_PORTAL_RUNS);
    }
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

  it("regression: 1778375369711-736806766 portal-shifted curved map has no floor_plain on open corridor edges", () => {
    const map = mapGenerationEndpoint.generateMap({
      seed: "1778375369711-736806766",
      levelIndex: 16,
      targetDifficulty: 16,
      maxTiles: 16 + 16 * 5,
      allowRamps: true,
      allowCurves: true,
    });
    expectMapValid(map);
    expect(map.portalLinks?.length ?? 0).toBeGreaterThan(0);
    const path = map.debugInfo.gridPath as GridCell[];
    const spine = map.debugInfo.spinePath as GridCell[];
    expect(Array.isArray(spine) && spine.length >= 2).toBe(true);
    expect(
      countMisclassifiedInteriorFloorPlain(
        map.tiles,
        path,
        spine,
        travelIntoStation,
      ),
    ).toBe(0);
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
    expect(level.finishKind).toBe("hole");
    expect(
      level.hazardSpecs.some((s) => s.kind === "portal_gate" && s.portalMode === "finish"),
    ).toBe(false);
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
    expect(level.finishKind).toBe("hole");
    expect(level.hazardSpecs.every((spec) =>
      spec.kind === "portal_gate" || spec.kind === "bumper_mushroom",
    )).toBe(true);
    expect(level.hazardSpecs.some((spec) => spec.portalMode === "finish")).toBe(
      false,
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
