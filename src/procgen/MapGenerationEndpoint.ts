import * as THREE from "three";
import type { GridCell } from "../level/pathGen";
import {
  computeCameraBoundsFromTiles,
  validateGeneratedMap,
} from "./GeneratedMapValidator";
import type { GenerateMapRequest, GeneratedMap } from "./MapGenerationTypes";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
  rotateFlatOffset,
  TILE_LENGTH,
} from "./TileCatalog";
import {
  capRotationForLane,
  centerOffsets,
  generateRandomPath,
  isPortraitReasonable,
  isTurnStation,
  laneCellsForDir,
  solveDoubleRowStraightPath,
  solveTilesAlongPath,
} from "./TilePlacementSolver";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampDifficultyInt(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}

function clampProgressionLevel(n: number): number {
  return Math.max(1, Math.min(20, Math.round(n)));
}

function difficultyFromWeights(sum: number): number {
  return clampDifficultyInt(sum / 2);
}

const MAX_PORTRAIT_GRID_SPAN = 4;
const PORTAL_GAP_UNLOCK_LEVEL = 8;
/** Cardinal spine steps × tile length — world separation after a portal cut (grid cells unchanged). */
const PORTAL_SEGMENT_GAP_ROWS = 2;

function keyCellGrid(c: GridCell): string {
  return `${c.x},${c.z}`;
}

/** Straight strip only — spine runs along x=0 at each z pair index. */
function syntheticSpineRowMajor(path: GridCell[]): GridCell[] {
  const pairs = path.length / 2;
  const spine: GridCell[] = [];
  for (let z = 0; z < pairs; z++) spine.push({ x: 0, z });
  return spine;
}

function travelIntoStation(spine: GridCell[], s: number): { x: number; z: number } {
  if (s <= 0) {
    const cur = spine[0]!;
    const next = spine[1]!;
    return { x: next.x - cur.x, z: next.z - cur.z };
  }
  const cur = spine[s]!;
  const prev = spine[s - 1]!;
  return { x: cur.x - prev.x, z: cur.z - prev.z };
}

function gapWorldFromCutStation(spine: GridCell[], cutStation: number): THREE.Vector3 {
  const cur = spine[cutStation]!;
  const next = spine[cutStation + 1]!;
  const dx = Math.sign(next.x - cur.x);
  const dz = Math.sign(next.z - cur.z);
  return new THREE.Vector3(
    dx * TILE_LENGTH * PORTAL_SEGMENT_GAP_ROWS,
    0,
    dz * TILE_LENGTH * PORTAL_SEGMENT_GAP_ROWS,
  );
}

function translationBeforeStation(
  station: number,
  cutsSorted: readonly number[],
  spine: GridCell[],
): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (const c of cutsSorted) {
    if (c < station) v.add(gapWorldFromCutStation(spine, c));
  }
  return v;
}

function repositionDeckTileFromGridCurved(
  tile: GeneratedMap["tiles"][number],
  cell: GridCell,
  gridCx: number,
  gridCz: number,
  worldExtra: THREE.Vector3,
  deckScratch: THREE.Vector3,
  pivotScratch: THREE.Vector3,
): void {
  const def = getTileDefinition(tile.tileType);
  const elev = tile.position.y;
  deckScratch.set(
    (cell.x - gridCx) * TILE_LENGTH,
    elev,
    (cell.z - gridCz) * TILE_LENGTH,
  );
  rotateFlatOffset(def.pivotOffsetFromDeckOrigin, tile.rotationY, pivotScratch);
  tile.position.copy(deckScratch).add(pivotScratch).add(worldExtra);
  tile.anchor.copy(tile.position);
}

function cloneProcgenTile(
  src: GeneratedMap["tiles"][number],
): GeneratedMap["tiles"][number] {
  return {
    ...src,
    position: src.position.clone(),
    anchor: src.anchor.clone(),
  };
}

/** Both lanes at this spine station are ramp tiles (ascending/descending pair row). */
function isRampLaneStation(
  byStation: Map<number, number[]>,
  tiles: GeneratedMap["tiles"],
  st: number,
): boolean {
  const idxs = byStation.get(st);
  if (!idxs || idxs.length !== 2) return false;
  const types = idxs.map((i) => tiles[i]!.tileType);
  return (
    types.includes("ramp_right_wall") && types.includes("ramp_left_wall")
  );
}

/**
 * Portal exit is station `s+1` (straight pair retargeted to start caps). Cut station `s` is also straight-only.
 * Still skip when a ramp row is **directly before** the dead-end (`s-1`) or **two stations ahead**
 * of the cut (`s+2` = first row after the exit): avoids portal exits sitting on ramp boundaries / wrong deck Y.
 */
function portalCutRampTopologySafe(
  s: number,
  spineLen: number,
  byStation: Map<number, number[]>,
  tiles: GeneratedMap["tiles"],
): boolean {
  if (s - 1 >= 0 && isRampLaneStation(byStation, tiles, s - 1)) {
    return false;
  }
  if (s + 2 < spineLen && isRampLaneStation(byStation, tiles, s + 2)) {
    return false;
  }
  return true;
}

function stationEligibleForPortalCut(
  spine: GridCell[],
  s: number,
  byStation: Map<number, number[]>,
  tiles: GeneratedMap["tiles"],
): boolean {
  if (s <= 2 || s >= spine.length - 1) return false;
  if (isTurnStation(spine, s)) return false;
  const idxs = byStation.get(s);
  const idxsNext = byStation.get(s + 1);
  if (!idxs || idxs.length !== 2 || !idxsNext || idxsNext.length !== 2) {
    return false;
  }
  const types = idxs.map((i) => tiles[i]!.tileType);
  const typesNext = idxsNext.map((i) => tiles[i]!.tileType);
  const pairStraight = (tt: typeof types) =>
    tt.every((t) => t === "straight_right_wall");
  if (!pairStraight(types) || !pairStraight(typesNext)) return false;
  return portalCutRampTopologySafe(s, spine.length, byStation, tiles);
}

interface DifficultyProfile {
  level: number;
  score: number;
  minInterior: number;
  maxInterior: number;
  turnBias: number;
  minTurns: number;
  maxTurns: number;
  rampChance: number;
  minRamps: number;
  maxRamps: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function difficultyProfile(req: GenerateMapRequest): DifficultyProfile {
  const level = clampProgressionLevel(req.targetDifficulty);
  const score = clampDifficultyInt(req.targetDifficulty);
  const t = (level - 1) / 19;
  const maxInteriorCap = Math.max(1, Math.floor((req.maxTiles - 4) / 2));
  const minInterior = Math.min(
    maxInteriorCap,
    Math.max(3, Math.round(3 + t * 15)),
  );
  const maxInterior = Math.min(
    maxInteriorCap,
    Math.max(minInterior, Math.round(6 + t * 24)),
  );
  const maxTurns = req.allowCurves ? Math.round(lerp(0, 8, t)) : 0;
  const minTurns =
    req.allowCurves && level >= 6
      ? Math.min(maxTurns, level >= 16 ? 4 : level >= 11 ? 2 : 1)
      : 0;
  const maxRamps = req.allowRamps ? Math.round(lerp(0, 5, t)) : 0;
  const minRamps =
    req.allowRamps && level >= 8
      ? Math.min(maxRamps, level >= 17 ? 3 : level >= 12 ? 2 : 1)
      : 0;
  return {
    level,
    score,
    minInterior,
    maxInterior,
    turnBias: lerp(0.03, 0.58, t),
    minTurns,
    maxTurns,
    rampChance: req.allowRamps ? lerp(0.03, 0.5, t) : 0,
    minRamps,
    maxRamps,
  };
}

function pickInteriorCount(
  req: GenerateMapRequest,
  rng: () => number,
  profile = difficultyProfile(req),
): number {
  const lo = profile.minInterior;
  const hi = profile.maxInterior;
  const span = hi - lo + 1;
  const n = lo + Math.floor(rng() * span);
  const cap = Math.max(1, req.maxTiles - 2);
  return Math.min(n, cap);
}

/** Interior **z** strips for double-row (each strip = 2 tiles). Total tiles = 2 * (interiorZ + 2). */
function pickInteriorZCount(
  req: GenerateMapRequest,
  rng: () => number,
  profile = difficultyProfile(req),
): number {
  const lo = profile.minInterior;
  const hi = profile.maxInterior;
  const span = hi - lo + 1;
  const nz = lo + Math.floor(rng() * span);
  const cap = Math.max(1, Math.floor((req.maxTiles - 4) / 2));
  return Math.min(nz, cap);
}

function computeStartHoleWorld(
  tiles: GeneratedMap["tiles"],
  _path: GridCell[],
): { start: THREE.Vector3; hole: THREE.Vector3 } {
  const first = tiles[0];
  const last = tiles[tiles.length - 1];
  const def0 = getTileDefinition(first.tileType);
  const defL = getTileDefinition(last.tileType);
  const deck0 = deckCenterWorldFromPivot(
    first.position,
    first.rotationY,
    def0,
  );
  const deckL = deckCenterWorldFromPivot(
    last.position,
    last.rotationY,
    defL,
  );
  void _path;
  const start = new THREE.Vector3(deck0.x, deck0.y, deck0.z);
  const hole = new THREE.Vector3(deckL.x, deckL.y, deckL.z);
  return { start, hole };
}

/** Start at midpoint between the two lane decks at station 0; hole at last pair midpoint. */
function computeStartHoleDoubleRow(
  tiles: GeneratedMap["tiles"],
  _spinePath?: GridCell[],
): { start: THREE.Vector3; hole: THREE.Vector3 } {
  void _spinePath;
  const pairCenter = (leftIndex: number): THREE.Vector3 => {
    const a = deckCenterWorldFromPivot(
      tiles[leftIndex].position,
      tiles[leftIndex].rotationY,
      getTileDefinition(tiles[leftIndex].tileType),
    );
    const b = deckCenterWorldFromPivot(
      tiles[leftIndex + 1].position,
      tiles[leftIndex + 1].rotationY,
      getTileDefinition(tiles[leftIndex + 1].tileType),
    );
    return new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
    );
  };

  const start = pairCenter(0);

  const n = tiles.length;
  const hole = pairCenter(n - 2);
  return { start, hole };
}

/** Every procgen course completes via a finish portal — paired gap portals are optional. */
function attachFinishPortalMetadata(map: GeneratedMap): GeneratedMap {
  const layout = map.debugInfo["layout"] as string | undefined;
  const n = map.tiles.length;
  if (layout === "double_row_straight" && n >= 2) {
    const fi = n - 2;
    return {
      ...map,
      finishKind: "portal",
      finishPortalTileIndex: fi,
      debugInfo: {
        ...map.debugInfo,
        finishKind: "portal",
        finishPortalTileIndex: fi,
      },
    };
  }
  if (layout === "single_path" && n >= 1) {
    const fi = n - 1;
    return {
      ...map,
      finishKind: "portal",
      finishPortalTileIndex: fi,
      debugInfo: {
        ...map.debugInfo,
        finishKind: "portal",
        finishPortalTileIndex: fi,
      },
    };
  }
  return map;
}

export interface MapGenerationEndpoint {
  generateMap(request: GenerateMapRequest): GeneratedMap;
}

class DefaultMapGenerationEndpoint implements MapGenerationEndpoint {
  generateMap(request: GenerateMapRequest): GeneratedMap {
    const targetInt = clampDifficultyInt(request.targetDifficulty);

    if (request.levelIndex === 1) {
      return this.generateTutorial(request);
    }

    if (
      request.levelIndex >= PORTAL_GAP_UNLOCK_LEVEL &&
      request.layout === "single_path"
    ) {
      return this.generatePortalGapSinglePath(request, targetInt);
    }

    if ((request.layout ?? "double_row_straight") === "double_row_straight") {
      return this.generateDoubleRowStraight(request, targetInt);
    }

    return this.generateSingleFilePath(request, targetInt);
  }

  private generatePortalGapSinglePath(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    const base = this.generateSingleFilePath(
      { ...request, layout: "single_path" },
      targetInt,
    );
    return this.applyPortalGaps(base, request);
  }

  private applyPortalGaps(map: GeneratedMap, request: GenerateMapRequest): GeneratedMap {
    const originalPath = map.debugInfo["gridPath"];
    if (!Array.isArray(originalPath) || originalPath.length !== map.tiles.length) {
      return map;
    }

    const rng = mulberry32(hashSeed(`${request.seed}|portal-gaps`));
    const path = [...(originalPath as GridCell[])];
    const tiles = [...map.tiles];
    const candidateCuts: number[] = [];
    for (let i = 3; i <= tiles.length - 4; i++) {
      const prev = tiles[i - 1];
      const cur = tiles[i];
      const next = tiles[i + 1];
      if (
        prev?.tileType === "straight_right_wall" &&
        cur?.tileType === "straight_right_wall" &&
        next?.tileType === "straight_right_wall"
      ) {
        candidateCuts.push(i);
      }
    }

    for (let i = candidateCuts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidateCuts[i], candidateCuts[j]] = [candidateCuts[j]!, candidateCuts[i]!];
    }

    const desiredCuts = request.levelIndex >= 14 ? 2 : 1;
    const cuts: number[] = [];
    for (const candidate of candidateCuts) {
      if (cuts.every((cut) => Math.abs(cut - candidate) >= 4)) {
        cuts.push(candidate);
      }
      if (cuts.length >= desiredCuts) break;
    }
    cuts.sort((a, b) => a - b);

    const removed = new Set(cuts);
    const oldToNew = new Map<number, number>();
    const nextPath: GridCell[] = [];
    const nextTiles: GeneratedMap["tiles"] = [];
    for (let oldIndex = 0; oldIndex < tiles.length; oldIndex++) {
      if (removed.has(oldIndex)) continue;
      oldToNew.set(oldIndex, nextTiles.length);
      const src = tiles[oldIndex]!;
      nextTiles.push({
        ...src,
        position: src.position.clone(),
        anchor: src.anchor.clone(),
      });
      nextPath.push(path[oldIndex]!);
    }

    const portalLinks = cuts.flatMap((cut, i) => {
      const fromTileIndex = oldToNew.get(cut - 1);
      const toTileIndex = oldToNew.get(cut + 1);
      if (fromTileIndex === undefined || toTileIndex === undefined) return [];
      return [{
        id: `portal-gap-${request.levelIndex}-${i}`,
        fromTileIndex,
        toTileIndex,
      }];
    });

    const finalTileIndex = nextTiles.length - 1;
    const lastTile = nextTiles[finalTileIndex]!;
    const finishDef = getTileDefinition(lastTile.tileType);
    const finishDeck = deckCenterWorldFromPivot(
      lastTile.position,
      lastTile.rotationY,
      finishDef,
    );

    const nextMap: GeneratedMap = {
      ...map,
      id: `${map.id}-portal`,
      tiles: nextTiles,
      holePosition: finishDeck,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: nextTiles }),
      portalLinks,
      finishPortalTileIndex: finalTileIndex,
      finishKind: "portal",
      debugInfo: {
        ...map.debugInfo,
        layout: "single_path",
        gridPath: nextPath,
        portalGaps: cuts,
        portalLinks,
        finishPortalTileIndex: finalTileIndex,
        finishKind: "portal",
      },
    };

    const v = validateGeneratedMap(nextMap, nextPath);
    return v.ok ? nextMap : map;
  }

  /**
   * Replaces eligible spine stations with {@link TileType.dead_end_cap} pairs (teleport entrance),
   * nudges all following tiles in **world space** along the spine forward direction (grid cells
   * unchanged — works with curves and ramps), retargets the next two-lane station to
   * {@link TileType.start_placeholder}, and wires portal pairs from dead-end **right** to **left**.
   */
  private applyPortalGapsDoubleRow(
    map: GeneratedMap,
    request: GenerateMapRequest,
  ): GeneratedMap {
    if (request.levelIndex < PORTAL_GAP_UNLOCK_LEVEL) return map;
    if ((request.layout ?? "double_row_straight") === "single_path") {
      return map;
    }
    if (map.debugInfo["layout"] !== "double_row_straight") return map;

    const originalPath = map.debugInfo["gridPath"];
    if (!Array.isArray(originalPath) || originalPath.length !== map.tiles.length) {
      return map;
    }
    if (originalPath.length % 2 !== 0) return map;

    const origPath = originalPath as GridCell[];
    const spineRaw = map.debugInfo["spinePath"];
    const spine: GridCell[] =
      Array.isArray(spineRaw) && spineRaw.length >= 2
        ? (spineRaw as GridCell[])
        : syntheticSpineRowMajor(origPath);

    if (spine.length < 3) return map;

    const tiles = map.tiles;
    const rng = mulberry32(hashSeed(`${request.seed}|portal-gaps-2row`));

    const byStation = new Map<number, number[]>();
    for (let i = 0; i < tiles.length; i++) {
      const st = tiles[i]?.stationIndex;
      if (typeof st !== "number") continue;
      const arr = byStation.get(st) ?? [];
      arr.push(i);
      byStation.set(st, arr);
    }
    for (const arr of byStation.values()) arr.sort((a, b) => a - b);

    const candidateStations: number[] = [];
    for (let s = 1; s <= spine.length - 2; s++) {
      if (!stationEligibleForPortalCut(spine, s, byStation, tiles)) continue;
      candidateStations.push(s);
    }

    for (let i = candidateStations.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidateStations[i], candidateStations[j]] = [
        candidateStations[j]!,
        candidateStations[i]!,
      ];
    }

    const desiredCuts = request.levelIndex >= 14 ? 2 : 1;
    const cuts: number[] = [];
    for (const s of candidateStations) {
      if (cuts.every((existing) => Math.abs(existing - s) >= 3)) {
        cuts.push(s);
      }
      if (cuts.length >= desiredCuts) break;
    }
    cuts.sort((a, b) => a - b);

    if (cuts.length === 0) return map;

    const cutsSet = new Set(cuts);
    const { cx: gridCx, cz: gridCz } = centerOffsets(origPath);

    const mergedTiles: GeneratedMap["tiles"] = [];
    const mergedPath: GridCell[] = [];
    const portalLinks: NonNullable<GeneratedMap["portalLinks"]> = [];

    let pendingPortalFrom: number | undefined;

    const deckScratch = new THREE.Vector3();
    const pivotScratch = new THREE.Vector3();
    const pivotWorld = new THREE.Vector3();

    for (let s = 0; s < spine.length; s++) {
      const tw = translationBeforeStation(s, cuts, spine);
      const indices = byStation.get(s);
      if (!indices?.length) continue;

      if (cutsSet.has(s)) {
        if (indices.length !== 2) return map;
        const travel = travelIntoStation(spine, s);
        const lane = laneCellsForDir(spine[s]!, travel.x, travel.z);
        const elev =
          (tiles[indices[0]!]!.position.y + tiles[indices[1]!]!.position.y) / 2;
        const deadDef = getTileDefinition("dead_end_cap");

        for (let pi = 0; pi < 2; pi++) {
          const cell = lane[pi]!;
          const isRight = pi === 1;
          const rotationY = capRotationForLane(
            travel.x,
            travel.z,
            isRight,
            "finish",
          );
          deckScratch.set(
            (cell.x - gridCx) * TILE_LENGTH,
            elev,
            (cell.z - gridCz) * TILE_LENGTH,
          );
          rotateFlatOffset(deadDef.pivotOffsetFromDeckOrigin, rotationY, pivotScratch);
          pivotWorld.copy(deckScratch).add(pivotScratch).add(tw);
          mergedTiles.push({
            id: `${map.id}-dead-s${s}-p${pi}`,
            tileType: "dead_end_cap",
            position: pivotWorld.clone(),
            rotationY,
            anchor: pivotWorld.clone(),
            entrySocket: deadDef.entrySocket,
            exitSocket: deadDef.exitSocket,
            modelKey: deadDef.modelKey,
            stationIndex: s,
          });
          mergedPath.push({ ...cell });
        }
        pendingPortalFrom = mergedTiles.length - 1;
        continue;
      }

      const travel = travelIntoStation(spine, s);
      const lane = laneCellsForDir(spine[s]!, travel.x, travel.z);
      const leftKey = keyCellGrid(lane[0]!);
      const rightKey = keyCellGrid(lane[1]!);

      let orderedIndices: number[];
      if (indices.length === 2) {
        const li = indices.find((i) => keyCellGrid(origPath[i]!) === leftKey);
        const ri = indices.find((i) => keyCellGrid(origPath[i]!) === rightKey);
        orderedIndices =
          li !== undefined && ri !== undefined ? [li, ri] : [...indices];
      } else {
        orderedIndices = [...indices].sort((a, b) => a - b);
      }

      let needsStartCapForStation = false;

      for (const idx of orderedIndices) {
        const cell = origPath[idx]!;

        if (
          pendingPortalFrom !== undefined &&
          indices.length === 2 &&
          keyCellGrid(cell) === leftKey
        ) {
          portalLinks.push({
            id: `portal-gap-2row-${request.levelIndex}-${portalLinks.length}`,
            fromTileIndex: pendingPortalFrom,
            toTileIndex: mergedTiles.length,
          });
          pendingPortalFrom = undefined;
          needsStartCapForStation = true;
        }

        const c = cloneProcgenTile(tiles[idx]!);

        if (needsStartCapForStation && indices.length === 2) {
          const isRight = keyCellGrid(cell) === rightKey;
          const startDef = getTileDefinition("start_placeholder");
          c.tileType = "start_placeholder";
          c.rotationY = capRotationForLane(
            travel.x,
            travel.z,
            isRight,
            "start",
          );
          c.entrySocket = startDef.entrySocket;
          c.exitSocket = startDef.exitSocket;
          c.modelKey = startDef.modelKey;
        }

        repositionDeckTileFromGridCurved(
          c,
          cell,
          gridCx,
          gridCz,
          tw,
          deckScratch,
          pivotScratch,
        );
        c.stationIndex = s;
        c.id = `${map.id}-s${s}-i${idx}`;
        mergedTiles.push(c);
        mergedPath.push(cell);
      }
    }

    if (pendingPortalFrom !== undefined) return map;
    if (portalLinks.length !== cuts.length) return map;

    const dbg = { ...map.debugInfo };

    const finalPairLeft = mergedTiles.length - 2;
    const { hole } = computeStartHoleDoubleRow(mergedTiles, undefined);

    const nextMap: GeneratedMap = {
      ...map,
      id: `${map.id}-portal2r`,
      tiles: mergedTiles,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: mergedTiles }),
      portalLinks,
      finishPortalTileIndex: finalPairLeft,
      finishKind: "portal",
      debugInfo: {
        ...dbg,
        gridPath: mergedPath,
        portalGapCutStations: cuts,
        portalLinks,
        finishPortalTileIndex: finalPairLeft,
        finishKind: "portal",
      },
    };

    const v = validateGeneratedMap(nextMap, mergedPath);
    return v.ok ? nextMap : map;
  }

  private generateDoubleRowStraight(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    let best: { map: GeneratedMap; path: GridCell[]; dist: number } | null =
      null;
    const profile = difficultyProfile(request);

    for (let cand = 0; cand < 30; cand++) {
      for (let retry = 0; retry < 40; retry++) {
        const rngZ = mulberry32(
          hashSeed(`${request.seed}|c${cand}|r${retry}`),
        );
        const interiorZ = pickInteriorZCount(request, rngZ, profile);
        const cellCountZ = interiorZ + 2;

        const solved = solveDoubleRowStraightPath(cellCountZ, {
          allowRamps: request.allowRamps,
          allowCurves: request.allowCurves,
          rng: rngZ,
          turnBias: profile.turnBias,
          minTurns: profile.minTurns,
          maxTurns: profile.maxTurns,
          rampChance: profile.rampChance,
          minRamps: profile.minRamps,
          maxRamps: profile.maxRamps,
        });
        if (!solved) continue;

        const { start, hole } = computeStartHoleDoubleRow(
          solved.tiles,
          solved.spinePath,
        );
        const path = solved.path;
        const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);

        const draft: GeneratedMap = {
          id: `proc-2row-${request.levelIndex}-${hashSeed(request.seed) & 0xffff}-${cand}-${retry}`,
          seed: request.seed,
          levelIndex: request.levelIndex,
          difficulty,
          tiles: solved.tiles,
          startPosition: start,
          holePosition: hole,
          cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
          imperfectDifficulty: false,
          debugInfo: {
            layout: "double_row_straight",
            cellCountZ,
            progressionProfile: profile,
            gridPath: path,
            ...(solved.spinePath ? { spinePath: solved.spinePath } : {}),
          },
        };

        const v = validateGeneratedMap(draft, path);
        if (!v.ok) continue;

        const dist = Math.abs(difficulty - targetInt);
        const matched = dist <= 1;
        const finalized = this.finalizeMap(draft, path, targetInt, matched);

        if (matched) {
          return this.applyPortalGapsDoubleRow(finalized, request);
        }

        if (!best || dist < best.dist) {
          best = { map: finalized, path, dist };
        }
      }
    }

    if (best) {
      best.map.imperfectDifficulty = true;
      best.map.debugInfo = {
        ...best.map.debugInfo,
        gridPath: best.path,
        layout: "double_row_straight",
        targetDifficulty: targetInt,
        matchedWithinOne: false,
      };
      return this.applyPortalGapsDoubleRow(best.map, request);
    }

    return this.applyPortalGapsDoubleRow(
      this.fallbackDoubleRow(request, targetInt),
      request,
    );
  }

  private generateSingleFilePath(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    let best: { map: GeneratedMap; path: GridCell[]; dist: number } | null =
      null;
    const profile = difficultyProfile(request);

    for (let cand = 0; cand < 30; cand++) {
      const rng = mulberry32(hashSeed(`${request.seed}|c${cand}`));
      const interior = pickInteriorCount(request, rng, profile);
      const cellCount = interior + 2;

      for (let retry = 0; retry < 40; retry++) {
        const rngPath = mulberry32(
          hashSeed(`${request.seed}|c${cand}|r${retry}`),
        );
        const turnBias = profile.turnBias + (rngPath() - 0.5) * 0.08;
        const path = generateRandomPath({
          rng: rngPath,
          cellCount,
          turnBias,
          allowCurves: request.allowCurves,
        });
        if (!path) continue;
        if (!isPortraitReasonable(path, MAX_PORTRAIT_GRID_SPAN)) continue;

        const solved = solveTilesAlongPath(path, {
          rng: mulberry32(hashSeed(`${request.seed}|sol|c${cand}|r${retry}`)),
          allowRamps: request.allowRamps,
          allowCurves: request.allowCurves,
          rampChance: profile.rampChance,
        });
        if (!solved) continue;

        const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
        const { start, hole } = computeStartHoleWorld(solved.tiles, path);

        const draft: GeneratedMap = {
          id: `proc-${request.levelIndex}-${hashSeed(request.seed) & 0xffff}-${cand}-${retry}`,
          seed: request.seed,
          levelIndex: request.levelIndex,
          difficulty,
          tiles: solved.tiles,
          startPosition: start,
          holePosition: hole,
          cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
          imperfectDifficulty: false,
          debugInfo: {
            layout: "single_path",
            progressionProfile: profile,
            gridPath: path,
          },
        };

        const v = validateGeneratedMap(draft, path);
        if (!v.ok) continue;

        const dist = Math.abs(difficulty - targetInt);
        const matched = dist <= 1;
        const finalized = this.finalizeMap(draft, path, targetInt, matched);

        if (matched) {
          return finalized;
        }

        if (!best || dist < best.dist) {
          best = { map: finalized, path, dist };
        }
      }
    }

    if (best) {
      best.map.imperfectDifficulty = true;
      best.map.debugInfo = {
        ...best.map.debugInfo,
        gridPath: best.path,
        layout: "single_path",
        targetDifficulty: targetInt,
        matchedWithinOne: false,
      };
      return best.map;
    }

    return this.fallbackCollinear(request, targetInt);
  }

  private finalizeMap(
    map: GeneratedMap,
    path: GridCell[],
    targetInt: number,
    matched: boolean,
  ): GeneratedMap {
    const next: GeneratedMap = {
      ...map,
      imperfectDifficulty: !matched,
      debugInfo: {
        ...map.debugInfo,
        gridPath: path,
        targetDifficulty: targetInt,
        matchedWithinOne: matched,
      },
    };
    return attachFinishPortalMetadata(next);
  }

  private generateTutorial(request: GenerateMapRequest): GeneratedMap {
    const useDouble =
      (request.layout ?? "double_row_straight") === "double_row_straight";

    if (useDouble) {
      const solved = solveDoubleRowStraightPath(3)!;
      const path = solved.path;
      const { start, hole } = computeStartHoleDoubleRow(
        solved.tiles,
        solved.spinePath,
      );
      const draft: GeneratedMap = {
        id: `proc-tutorial-${request.levelIndex}-${hashSeed(request.seed)}`,
        seed: request.seed,
        levelIndex: request.levelIndex,
        difficulty: 0,
        tiles: solved.tiles,
        startPosition: start,
        holePosition: hole,
        cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
        imperfectDifficulty: false,
        debugInfo: {
          layout: "double_row_straight",
          gridPath: path,
          tutorial: true,
          targetDifficulty: 0,
          matchedWithinOne: true,
          cellCountZ: 3,
        },
      };
      const v = validateGeneratedMap(draft, path);
      if (!v.ok) {
        return this.fallbackDoubleRow(request, 0);
      }
      return attachFinishPortalMetadata(draft);
    }

    const path: GridCell[] = [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
    ];
    const rng = mulberry32(hashSeed(`${request.seed}|tutorial`));
    const solved = solveTilesAlongPath(path, {
      rng,
      allowRamps: false,
      allowCurves: false,
    })!;
    const { start, hole } = computeStartHoleWorld(solved.tiles, path);
    const draft: GeneratedMap = {
      id: `proc-tutorial-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty: 0,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: false,
      debugInfo: {
        layout: "single_path",
        gridPath: path,
        tutorial: true,
        targetDifficulty: 0,
        matchedWithinOne: true,
      },
    };
    const v = validateGeneratedMap(draft, path);
    if (!v.ok) {
      return this.fallbackCollinear(request, 0);
    }
    return attachFinishPortalMetadata(draft);
  }

  private fallbackDoubleRow(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    const rng = mulberry32(hashSeed(`${request.seed}|fallback2r`));
    const profile = difficultyProfile(request);
    const interiorZ = Math.min(
      12,
      Math.max(2, pickInteriorZCount(request, rng, profile)),
    );
    const cellCountZ = interiorZ + 2;
    const solved = solveDoubleRowStraightPath(cellCountZ, {
      allowRamps: request.allowRamps,
      allowCurves: request.allowCurves,
      rng,
      turnBias: profile.turnBias,
      minTurns: profile.minTurns,
      maxTurns: profile.maxTurns,
      rampChance: profile.rampChance,
      minRamps: profile.minRamps,
      maxRamps: profile.maxRamps,
    })!;
    const path = solved.path;
    const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
    const { start, hole } = computeStartHoleDoubleRow(
      solved.tiles,
      solved.spinePath,
    );
    const draft: GeneratedMap = {
      id: `proc-fallback-2r-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: Math.abs(difficulty - targetInt) > 1,
      debugInfo: {
        layout: "double_row_straight",
        gridPath: path,
        progressionProfile: profile,
        ...(solved.spinePath ? { spinePath: solved.spinePath } : {}),
        fallback: true,
        targetDifficulty: targetInt,
        matchedWithinOne: Math.abs(difficulty - targetInt) <= 1,
        cellCountZ,
      },
    };
    return attachFinishPortalMetadata(draft);
  }

  private fallbackCollinear(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    const rng = mulberry32(hashSeed(`${request.seed}|fallback`));
    const profile = difficultyProfile(request);
    const interior = Math.min(
      12,
      Math.max(profile.minInterior, pickInteriorCount(request, rng, profile)),
    );
    const cellCount = interior + 2;
    const path: GridCell[] = [];
    for (let z = 0; z < cellCount; z++) {
      path.push({ x: 0, z });
    }
    const solved = solveTilesAlongPath(path, {
      rng,
      allowRamps: request.allowRamps,
      allowCurves: false,
      rampChance: profile.rampChance,
    })!;
    const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
    const { start, hole } = computeStartHoleWorld(solved.tiles, path);
    const draft: GeneratedMap = {
      id: `proc-fallback-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: Math.abs(difficulty - targetInt) > 1,
      debugInfo: {
        layout: "single_path",
        gridPath: path,
        progressionProfile: profile,
        fallback: true,
        targetDifficulty: targetInt,
        matchedWithinOne: Math.abs(difficulty - targetInt) <= 1,
      },
    };
    return attachFinishPortalMetadata(draft);
  }
}

export const mapGenerationEndpoint: MapGenerationEndpoint =
  new DefaultMapGenerationEndpoint();
