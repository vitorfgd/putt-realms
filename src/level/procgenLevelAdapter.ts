import type {
  GeneratedMap,
  PlacedTile as ProcgenTile,
  PortalLink,
} from "../procgen/MapGenerationTypes";
import { PROCGEN_TILE_TO_ASSET } from "../procgen/procgenAssetKeys";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
} from "../procgen/TileCatalog";
import { bendOuterRailSigns } from "./bendOuterRails";
import {
  flatProcgenPatch,
  rampProcgenPatch,
  sampleCourseSurface,
} from "./courseSurface";
import { generateHazardSpecs } from "./generateHazardSpecs";
import { hazardWeight } from "../hazards/HazardTypes";
import type {
  CourseSurface,
  GeneratedLevel,
  HazardSpawnSpec,
  PlacedTile as GamePlacedTile,
} from "./LevelTypes";
import type { GridCell } from "./pathGen";
import { buildRailColliders } from "./railColliders";

export interface ProcgenAdaptOptions {
  levelIndex: number;
  /** Integer difficulty target shown in HUD / skip pricing — mirrors legacy generator. */
  targetDifficultyRounded: number;
  rng: () => number;
  /**
   * Skip {@link validateAdaptedLevel} (surface samples, rail sanity). Procgen debug uses this when a map
   * fails strict checks but deck positions are still valid for visual passes (island décor, undermap slots).
   */
  skipGameplayValidation?: boolean;
}

function gridPathFromDebug(map: GeneratedMap): GridCell[] {
  const gp = map.debugInfo["gridPath"];
  if (!Array.isArray(gp)) {
    throw new Error(
      "procgenLevelAdapter: expected map.debugInfo.gridPath from MapGenerationEndpoint",
    );
  }
  return gp as GridCell[];
}

function keyCell(c: GridCell): string {
  return `${c.x},${c.z}`;
}

/** Interior grid cells on an axis-aligned L from A→B (exclusive endpoints after stepping). */
function intermediateCellsManhattan(a: GridCell, b: GridCell): GridCell[] {
  const out: GridCell[] = [];
  let x = a.x;
  let z = a.z;
  while (x !== b.x || z !== b.z) {
    if (x !== b.x) x += Math.sign(b.x - x);
    else if (z !== b.z) z += Math.sign(b.z - z);
    if (x === b.x && z === b.z) break;
    out.push({ x, z });
  }
  return out;
}

/**
 * Portal jumps leave cardinal gaps in grid occupancy; without phantom cells, {@link exposedSides}
 * treats void as open and strips corridor rails. Works for curved courses (any x,z), not only z strips.
 */
function occupiedForRailExposure(
  path: GridCell[],
  portalLinks: readonly PortalLink[] | undefined,
): Set<string> {
  const occupied = new Set(path.map(keyCell));
  if (!portalLinks?.length) return occupied;
  for (const link of portalLinks) {
    const a = path[link.fromTileIndex];
    const b = path[link.toTileIndex];
    if (!a || !b) continue;
    for (const c of intermediateCellsManhattan(a, b)) {
      occupied.add(keyCell(c));
    }
  }
  return occupied;
}

function exposedSides(
  cell: GridCell,
  occupied: ReadonlySet<string>,
): { x: number; z: number }[] {
  const sides = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  return sides.filter((s) => !occupied.has(`${cell.x + s.x},${cell.z + s.z}`));
}

function toGameplayTile(
  pt: ProcgenTile,
  prev: GridCell | undefined,
  cur: GridCell,
  next: GridCell | undefined,
  exposed: readonly { x: number; z: number }[],
): GamePlacedTile {
  const def = getTileDefinition(pt.tileType);
  const deck = deckCenterWorldFromPivot(pt.position, pt.rotationY, def);

  let type: GamePlacedTile["type"];
  let railS: GamePlacedTile["railS"];
  let railWorldSides: GamePlacedTile["railWorldSides"];

  switch (pt.tileType) {
    case "start_placeholder":
      type = "start";
      railWorldSides = [...exposed];
      break;
    case "hole_placeholder":
      type = "hole";
      railWorldSides = [...exposed];
      break;
    case "dead_end_cap":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "straight_right_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "ramp_right_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "ramp_left_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "floor_plain":
      type = "floor";
      railWorldSides = [];
      break;
    case "convex_right_wall":
      type = "corner";
      railWorldSides = [...exposed];
      if (pt.railS !== undefined) {
        railS = pt.railS;
      } else if (prev !== undefined && next !== undefined) {
        railS = bendOuterRailSigns(
          cur.x - prev.x,
          cur.z - prev.z,
          next.x - cur.x,
          next.z - cur.z,
        );
      }
      break;
    case "concave_right_wall":
      type = "corner";
      railWorldSides = [...exposed];
      if (pt.railS !== undefined) {
        railS = pt.railS;
      } else if (prev !== undefined && next !== undefined) {
        railS = bendOuterRailSigns(
          cur.x - prev.x,
          cur.z - prev.z,
          next.x - cur.x,
          next.z - cur.z,
        );
      }
      break;
    default:
      type = "straight";
  }

  const out: GamePlacedTile = {
    type,
    gridX: cur.x,
    gridZ: cur.z,
    worldX: deck.x,
    // Only set worldY when non-zero (elevated tile) to keep flat levels unchanged.
    ...(deck.y !== 0 ? { worldY: deck.y } : {}),
    worldZ: deck.z,
    rotationY: pt.rotationY,
    ...(pt.stationIndex !== undefined ? { stationIndex: pt.stationIndex } : {}),
    ...(pt.tileType === "ramp_right_wall" || pt.tileType === "ramp_left_wall"
      ? { isRamp: true, hazardSafe: false }
      : {}),
    ...(type === "straight" &&
    pt.tileType !== "ramp_right_wall" &&
    pt.tileType !== "ramp_left_wall"
      ? { hazardSafe: true }
      : type !== "straight"
        ? { hazardSafe: false }
        : {}),
    ...(PROCGEN_TILE_TO_ASSET[pt.tileType]
      ? { assetKeyOverride: PROCGEN_TILE_TO_ASSET[pt.tileType] }
      : {}),
    ...(railWorldSides !== undefined ? { railWorldSides } : {}),
  };
  if (railS !== undefined) {
    out.railS = railS;
  }
  return out;
}

function buildProcgenSurface(map: GeneratedMap): CourseSurface {
  return {
    patches: map.tiles.map((pt) => {
      const def = getTileDefinition(pt.tileType);
      const deck = deckCenterWorldFromPivot(pt.position, pt.rotationY, def);
      if (pt.tileType === "ramp_right_wall" || pt.tileType === "ramp_left_wall") {
        return rampProcgenPatch(deck.x, deck.z, deck.y, pt.rotationY);
      }
      return flatProcgenPatch(deck.x, deck.z, deck.y, pt.rotationY);
    }),
  };
}

function progressionLevelFromDebug(map: GeneratedMap): number | undefined {
  const profile = map.debugInfo["progressionProfile"];
  if (!profile || typeof profile !== "object") return undefined;
  const level = (profile as { level?: unknown }).level;
  return typeof level === "number" ? level : undefined;
}

/**
 * World midpoint between the anchor tile and its portal partner: same procgen {@link TileType},
 * same optional {@link PlacedTile.stationIndex}, grid Manhattan distance 1 (lateral lanes **or**
 * consecutive spine cells like (-4,3)/(-4,2)).
 */
function portalEndpointMidpointWorld(
  map: GeneratedMap,
  gameplayTiles: readonly GamePlacedTile[],
  path: GridCell[],
  anchorIdx: number,
): { x: number; z: number; y: number } | undefined {
  const pa = path[anchorIdx];
  const anchorProc = map.tiles[anchorIdx];
  const ta = gameplayTiles[anchorIdx];
  if (!pa || !anchorProc || !ta) return undefined;

  const anchorType = anchorProc.tileType;
  const station = ta.stationIndex;

  for (let j = 0; j < map.tiles.length; j++) {
    if (j === anchorIdx) continue;
    if (map.tiles[j]?.tileType !== anchorType) continue;
    const pb = path[j];
    const tb = gameplayTiles[j];
    if (!pb || !tb) continue;
    if (
      typeof station === "number" &&
      typeof tb.stationIndex === "number" &&
      tb.stationIndex !== station
    ) {
      continue;
    }
    const manhattan = Math.abs(pa.x - pb.x) + Math.abs(pa.z - pb.z);
    if (manhattan !== 1) continue;
    return {
      x: (ta.worldX + tb.worldX) / 2,
      z: (ta.worldZ + tb.worldZ) / 2,
      y: ((ta.worldY ?? 0) + (tb.worldY ?? 0)) / 2,
    };
  }

  const tryPathAdjacentLateral = (a: number, b: number) => {
    const pA = path[a];
    const pB = path[b];
    if (!pA || !pB) return undefined;
    if (pA.z !== pB.z || Math.abs(pA.x - pB.x) !== 1) return undefined;
    const tA = gameplayTiles[a];
    const tB = gameplayTiles[b];
    if (!tA || !tB) return undefined;
    return {
      x: (tA.worldX + tB.worldX) / 2,
      z: (tA.worldZ + tB.worldZ) / 2,
      y: ((tA.worldY ?? 0) + (tB.worldY ?? 0)) / 2,
    };
  };
  return (
    tryPathAdjacentLateral(anchorIdx - 1, anchorIdx) ??
    tryPathAdjacentLateral(anchorIdx, anchorIdx + 1)
  );
}

function portalHazardSpecsFromMap(
  map: GeneratedMap,
  gameplayTiles: readonly GamePlacedTile[],
  path: GridCell[],
): HazardSpawnSpec[] {
  const out: HazardSpawnSpec[] = [];
  for (const link of map.portalLinks ?? []) {
    const portalPairId = link.id;
    const weight = hazardWeight("portal_gate");
    const fromMid = portalEndpointMidpointWorld(
      map,
      gameplayTiles,
      path,
      link.fromTileIndex,
    );
    const toMid = portalEndpointMidpointWorld(
      map,
      gameplayTiles,
      path,
      link.toTileIndex,
    );
    out.push({
      id: `${link.id}-a`,
      kind: "portal_gate",
      tileIndex: link.fromTileIndex,
      weight,
      portalPairId,
      portalRole: "a",
      portalMode: "pair",
      ...(fromMid
        ? {
            portalSpawnWorldX: fromMid.x,
            portalSpawnWorldZ: fromMid.z,
            portalSpawnDeckY: fromMid.y,
          }
        : {}),
    });
    out.push({
      id: `${link.id}-b`,
      kind: "portal_gate",
      tileIndex: link.toTileIndex,
      weight,
      portalPairId,
      portalRole: "b",
      portalMode: "pair",
      ...(toMid
        ? {
            portalSpawnWorldX: toMid.x,
            portalSpawnWorldZ: toMid.z,
            portalSpawnDeckY: toMid.y,
          }
        : {}),
    });
  }

  if (map.finishKind === "portal" && map.finishPortalTileIndex !== undefined) {
    const fi = map.finishPortalTileIndex;
    const hp = map.holePosition;
    const spawnRot = finishPortalSpawnRotationY(gameplayTiles, fi);
    out.push({
      id: `finish-portal-${fi}`,
      kind: "portal_gate",
      tileIndex: fi,
      weight: hazardWeight("portal_gate"),
      portalMode: "finish",
      portalSpawnWorldX: hp.x,
      portalSpawnWorldZ: hp.z,
      portalSpawnDeckY: hp.y,
      ...(spawnRot !== undefined ? { portalSpawnRotationY: spawnRot } : {}),
    });
  }
  return out;
}

/**
 * World Y rotation so the finish portal faces **into** the last segment (same basis as paired portals).
 * Double-row: bearing from previous pair midpoint → last pair midpoint. Single-file: previous tile → last.
 */
function finishPortalSpawnRotationY(
  tiles: readonly GamePlacedTile[],
  finishPortalTileIndex: number,
): number | undefined {
  const fi = finishPortalTileIndex;
  const n = tiles.length;
  if (fi < 1) return undefined;

  if (fi + 1 < n && fi === n - 2) {
    if (fi < 2) return undefined;
    const prevL = tiles[fi - 2]!;
    const prevR = tiles[fi - 1]!;
    const finL = tiles[fi]!;
    const finR = tiles[fi + 1]!;
    const px = (prevL.worldX + prevR.worldX) / 2;
    const pz = (prevL.worldZ + prevR.worldZ) / 2;
    const fx = (finL.worldX + finR.worldX) / 2;
    const fz = (finL.worldZ + finR.worldZ) / 2;
    const dx = fx - px;
    const dz = fz - pz;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return undefined;
    return Math.atan2(dx, dz);
  }

  const cur = tiles[fi];
  const prev = tiles[fi - 1];
  if (!cur || !prev) return undefined;
  const dx = cur.worldX - prev.worldX;
  const dz = cur.worldZ - prev.worldZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return undefined;
  return Math.atan2(dx, dz);
}

function validateAdaptedLevel(level: GeneratedLevel): void {
  if (level.surface.patches.length < level.tiles.length) {
    throw new Error("procgenLevelAdapter: missing surface patches");
  }
  if (!sampleCourseSurface(level.surface, level.startPosition.x, level.startPosition.z)) {
    throw new Error("procgenLevelAdapter: start position has no support");
  }
  if (!sampleCourseSurface(level.surface, level.holePosition.x, level.holePosition.z)) {
    throw new Error("procgenLevelAdapter: hole position has no support");
  }
  for (const rail of level.railColliders) {
    const finite =
      Number.isFinite(rail.ax) &&
      Number.isFinite(rail.az) &&
      Number.isFinite(rail.bx) &&
      Number.isFinite(rail.bz);
    const len = Math.hypot(rail.bx - rail.ax, rail.bz - rail.az);
    if (!finite || len < 0.001) {
      throw new Error("procgenLevelAdapter: invalid rail collider");
    }
  }
}

/**
 * Bridges procedural {@link GeneratedMap} into legacy {@link GeneratedLevel} for TileKit / physics.
 * Gameplay stays unaware of procgen details — swap this adapter or the endpoint later.
 */
export function adaptProcgenMapToGeneratedLevel(
  map: GeneratedMap,
  opts: ProcgenAdaptOptions,
): GeneratedLevel {
  const path = gridPathFromDebug(map);
  if (path.length !== map.tiles.length) {
    throw new Error("procgenLevelAdapter: gridPath length mismatch");
  }

  const tiles: GamePlacedTile[] = [];
  const occupied = occupiedForRailExposure(path, map.portalLinks);
  for (let i = 0; i < map.tiles.length; i++) {
    const cur = path[i];
    tiles.push(
      toGameplayTile(
        map.tiles[i],
        path[i - 1],
        cur,
        path[i + 1],
        exposedSides(cur, occupied),
      ),
    );
  }

  const progressionLevel = progressionLevelFromDebug(map);
  const portalSpecsAll = portalHazardSpecsFromMap(map, tiles, path);
  /** Gameplay uses the cup + hole sink at {@link map.holePosition}; skip the finish teleporter mesh. */
  const portalSpecs = portalSpecsAll.filter((s) => s.portalMode !== "finish");
  const reservedPortalTiles = new Set(portalSpecs.map((spec) => spec.tileIndex));
  const scatterSpecs = generateHazardSpecs(
    progressionLevel ?? opts.levelIndex,
    tiles,
    opts.rng,
  ).filter((spec) => !reservedPortalTiles.has(spec.tileIndex));
  const hazardSpecs = [...portalSpecs, ...scatterSpecs];
  const surface = buildProcgenSurface(map);

  const bounds = {
    minX: map.cameraBounds.min.x,
    maxX: map.cameraBounds.max.x,
    minZ: map.cameraBounds.min.z,
    maxZ: map.cameraBounds.max.z,
  };

  const level: GeneratedLevel = {
    id: map.id,
    levelIndex: opts.levelIndex,
    difficultyScore: map.difficulty,
    targetDifficulty: opts.targetDifficultyRounded,
    imperfectDifficulty: map.imperfectDifficulty ? true : undefined,
    hazardSpecs,
    tiles,
    startPosition: {
      x: map.startPosition.x,
      y: map.startPosition.y,
      z: map.startPosition.z,
    },
    holePosition: {
      x: map.holePosition.x,
      y: map.holePosition.y,
      z: map.holePosition.z,
    },
    ...(map.finishKind === "portal"
      ? { finishKind: "hole" as const }
      : map.finishKind
        ? { finishKind: map.finishKind }
        : {}),
    bounds,
    surface,
    procgenDebugInfo: map.debugInfo,
    procgenSeed: map.seed,
    progressionLevel,
    par: Math.max(2, Math.ceil((progressionLevel ?? opts.levelIndex) / 4) + 2),
    realmId: "sky_meadow",
    collectibles: [],
    railColliders: buildRailColliders(tiles),
    procgenSourceMap: map,
  };
  if (!opts.skipGameplayValidation) {
    validateAdaptedLevel(level);
  }
  return level;
}
