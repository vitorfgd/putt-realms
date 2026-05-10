import type { GridCell } from "../level/pathGen";
import { deckCenterWorldFromPivot, getTileDefinition, TILE_LENGTH } from "./TileCatalog";
import type { Box3Like, GeneratedMap } from "./MapGenerationTypes";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isFiniteVec(v: { x: number; y: number; z: number }): boolean {
  return (
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
  );
}

const MAX_AXIS_SPAN = 800;

/** Belt-and-suspenders: each fairway cell appears at most once in gridPath. */
function validateGridPathUniqueOccupancy(path: GridCell[] | undefined): string[] {
  const errors: string[] = [];
  if (!path?.length) return errors;
  const seen = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const k = `${path[i].x},${path[i].z}`;
    if (seen.has(k)) errors.push(`duplicate gridPath cell ${k}`);
    seen.add(k);
  }
  return errors;
}

function portalBridgeKeys(map: GeneratedMap): Set<string> {
  const out = new Set<string>();
  for (const link of map.portalLinks ?? []) {
    out.add(`${link.fromTileIndex}->${link.toTileIndex}`);
  }
  return out;
}

/** Cardinal-adjacent steps only, unless a portal metadata link bridges the gap. */
function validateChain(path: GridCell[] | undefined, map?: GeneratedMap): string[] {
  const errors: string[] = [];
  if (!path || path.length < 2) {
    errors.push("gridPath missing or too short");
    return errors;
  }
  const bridges = map ? portalBridgeKeys(map) : new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dz = Math.abs(path[i].z - path[i - 1].z);
    if (dx + dz !== 1 && !bridges.has(`${i - 1}->${i}`)) {
      errors.push(`non-adjacent chain step at index ${i}`);
    }
  }
  return errors;
}

/** Row-major pairs (0,z),(1,z) for each z — no single-file cardinal chain. */
function validateDoubleRowStraightPath(path: GridCell[] | undefined): string[] {
  const errors: string[] = [];
  if (!path || path.length < 4) {
    errors.push("double-row path missing or too short");
    return errors;
  }
  if (path.length % 2 !== 0) {
    errors.push("double-row path must have even length");
    return errors;
  }
  const seen = new Set<string>();
  const pairs = path.length / 2;
  for (let zi = 0; zi < pairs; zi++) {
    const a = path[zi * 2];
    const b = path[zi * 2 + 1];
    if (a.x !== 0 || b.x !== 1 || a.z !== zi || b.z !== zi) {
      errors.push(
        `double-row: expected (0,${zi})(1,${zi}) at indices ${zi * 2},${zi * 2 + 1}`,
      );
    }
    for (const p of [a, b]) {
      const k = `${p.x},${p.z}`;
      if (seen.has(k)) errors.push(`duplicate grid cell ${k}`);
      seen.add(k);
    }
  }
  return errors;
}

/**
 * Double-row course with missing grid rows bridged by {@link GeneratedMap.portalLinks}.
 * Pair index does **not** equal grid z when rows were removed; z must increase monotonically.
 */
function validateDoubleRowStraightPathWithPortalGaps(
  path: GridCell[] | undefined,
  map: GeneratedMap,
): string[] {
  const errors: string[] = [];
  if (!path || path.length < 4) {
    errors.push("double-row path missing or too short");
    return errors;
  }
  if (path.length % 2 !== 0) {
    errors.push("double-row path must have even length");
    return errors;
  }
  const bridges = portalBridgeKeys(map);
  const seen = new Set<string>();
  const pairs = path.length / 2;
  let prevZ: number | null = null;

  for (let zi = 0; zi < pairs; zi++) {
    const a = path[zi * 2];
    const b = path[zi * 2 + 1];
    if (!a || !b) continue;

    if (a.x !== 0 || b.x !== 1 || a.z !== b.z) {
      errors.push(
        `double-row pair ${zi}: expected (0,z)(1,z), got (${a.x},${a.z}) (${b.x},${b.z})`,
      );
    }
    const z = a.z;
    for (const p of [a, b]) {
      const k = `${p.x},${p.z}`;
      if (seen.has(k)) errors.push(`duplicate grid cell ${k}`);
      seen.add(k);
    }

    if (prevZ !== null) {
      const dz = z - prevZ;
      if (dz < 1) {
        errors.push(`double-row: grid z must increase between pairs (${prevZ} → ${z})`);
      } else if (dz >= 2) {
        const iFrom = zi * 2 - 1;
        const iTo = zi * 2;
        if (!bridges.has(`${iFrom}->${iTo}`)) {
          errors.push(
            `double-row: missing portal bridge across removed rows (${prevZ} → ${z}) at path indices ${iFrom}→${iTo}`,
          );
        }
      }
    }
    prevZ = z;
  }
  return errors;
}

function validateDoubleRowCurvedPath(
  path: GridCell[] | undefined,
  spinePath: GridCell[] | undefined,
  map: GeneratedMap,
): string[] {
  const errors: string[] = [];
  if (!path || path.length < 4) {
    errors.push("double-row path missing or too short");
    return errors;
  }
  if (!spinePath || spinePath.length < 2) {
    errors.push("double-row spinePath missing or too short");
    return errors;
  }
  if (path.length < spinePath.length || path.length > spinePath.length * 4) {
    errors.push("double-row tile path has an invalid number of occupied cells");
  }
  errors.push(
    ...validateGridPathUniqueOccupancy(spinePath).map((e) => `spine: ${e}`),
  );
  errors.push(...validateChain(spinePath).map((e) => `spine: ${e}`));
  const cellTypes = new Map<string, string>();
  for (let i = 0; i < path.length; i++) {
    if (!Number.isFinite(path[i].x) || !Number.isFinite(path[i].z)) {
      errors.push(`double-row non-finite lane path cell at index ${i}`);
    }
    cellTypes.set(`${path[i].x},${path[i].z}`, map.tiles[i]?.tileType ?? "");
  }
  for (let i = 1; i < spinePath.length - 1; i++) {
    const prev = spinePath[i - 1];
    const cur = spinePath[i];
    const next = spinePath[i + 1];
    const inX = cur.x - prev.x;
    const inZ = cur.z - prev.z;
    const outX = next.x - cur.x;
    const outZ = next.z - cur.z;
    if (inX === outX && inZ === outZ) continue;

    const rightIn = { x: inZ, z: -inX };
    const rightOut = { x: outZ, z: -outX };
    const diagonal = {
      x: cur.x + rightIn.x + rightOut.x,
      z: cur.z + rightIn.z + rightOut.z,
    };
    const turnsLeft = inX * outZ - inZ * outX > 0;
    const inner = turnsLeft ? cur : diagonal;
    const outer = turnsLeft ? diagonal : cur;
    const innerKey = `${inner.x},${inner.z}`;
    const outerKey = `${outer.x},${outer.z}`;
    const innerType = cellTypes.get(innerKey);
    const expectedInner = innerType === "floor_plain";
    if (!expectedInner) {
      errors.push(`turn at spine ${i}: missing inner floor fill at ${innerKey}`);
    }
    if (cellTypes.get(outerKey) !== "convex_right_wall") {
      errors.push(`turn at spine ${i}: missing outer convex_right_wall at ${outerKey}`);
    }
  }
  return errors;
}

export function validateGeneratedMap(
  map: GeneratedMap,
  gridPath?: GridCell[],
): ValidationResult {
  const errors: string[] = [];

  const starts = map.tiles.filter((t) => t.tileType === "start_placeholder");
  const holes = map.tiles.filter((t) => t.tileType === "hole_placeholder");
  const portalFinish = map.finishKind === "portal";
  if (starts.length < 1) errors.push("need at least one start tile");
  if (!portalFinish && holes.length < 1) errors.push("need at least one hole tile");
  if (portalFinish) {
    const i = map.finishPortalTileIndex;
    if (i === undefined || !map.tiles[i]) {
      errors.push("portal finish map needs a valid finishPortalTileIndex");
    }
  }

  for (const t of map.tiles) {
    if (!isFiniteVec(t.position)) errors.push(`NaN tile position ${t.id}`);
    if (!Number.isFinite(t.rotationY)) errors.push(`NaN rotation ${t.id}`);
  }
  for (const link of map.portalLinks ?? []) {
    if (!map.tiles[link.fromTileIndex] || !map.tiles[link.toTileIndex]) {
      errors.push(`invalid portal link indices ${link.id}`);
    }
  }

  errors.push(...validateGridPathUniqueOccupancy(gridPath));

  const layout = map.debugInfo["layout"] as string | undefined;
  if (layout === "double_row_straight") {
    const spinePath = map.debugInfo["spinePath"];
    if (Array.isArray(spinePath)) {
      errors.push(
        ...validateDoubleRowCurvedPath(gridPath, spinePath as GridCell[], map),
      );
    } else if (
      map.finishKind === "portal" ||
      (map.portalLinks?.length ?? 0) > 0
    ) {
      errors.push(
        ...validateDoubleRowStraightPathWithPortalGaps(gridPath, map),
      );
    } else {
      errors.push(...validateDoubleRowStraightPath(gridPath));
    }
  } else {
    errors.push(...validateChain(gridPath, map));
  }

  const path = gridPath;
  if (path && path.length !== map.tiles.length) {
    errors.push("tile count vs gridPath length mismatch");
  }

  const b = map.cameraBounds;
  const spanX = b.max.x - b.min.x;
  const spanZ = b.max.z - b.min.z;
  if (
    !Number.isFinite(spanX) ||
    !Number.isFinite(spanZ) ||
    spanX <= 0 ||
    spanZ <= 0
  ) {
    errors.push("invalid camera bounds span");
  }
  if (spanX > MAX_AXIS_SPAN || spanZ > MAX_AXIS_SPAN) {
    errors.push("camera bounds exceed reasonable size");
  }

  return { ok: errors.length === 0, errors };
}

/** Axis-aligned bounds covering deck centers ± rotated footprints. */
export function computeCameraBoundsFromTiles(
  map: Pick<GeneratedMap, "tiles">,
): Box3Like {
  let minX = Infinity;
  const minY = -4;
  let minZ = Infinity;
  let maxX = -Infinity;
  const maxY = 8;
  let maxZ = -Infinity;

  for (const t of map.tiles) {
    const def = getTileDefinition(t.tileType);
    const cxz = deckCenterWorldFromPivot(t.position, t.rotationY, def);
    const hw = def.footprint.halfWidth;
    const hl = def.footprint.halfLength;
    const c = Math.cos(t.rotationY);
    const s = Math.sin(t.rotationY);
    const ax = Math.abs(c * hw) + Math.abs(s * hl);
    const az = Math.abs(s * hw) + Math.abs(c * hl);
    const pad = TILE_LENGTH * 0.25;
    minX = Math.min(minX, cxz.x - ax - pad);
    minZ = Math.min(minZ, cxz.z - az - pad);
    maxX = Math.max(maxX, cxz.x + ax + pad);
    maxZ = Math.max(maxZ, cxz.z + az + pad);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}
