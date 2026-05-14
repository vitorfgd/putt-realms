import * as THREE from "three";
import { assetRegistry } from "../art/AssetRegistry";
import type { UndermapIslandSlot } from "../level/undermapIslands";
import type { GridCell } from "../level/pathGen";
import { TILE_SIZE } from "../level/TileDimensions";
import type { GeneratedMap, PlacedTile } from "./MapGenerationTypes";
import { deckCenterWorldFromPivot, getTileDefinition } from "./TileCatalog";

const ASSET_KEY = "undermap_island" as const;

/** Deck heights within this tolerance count as “same height” for a 2×2 block. */
const DECK_Y_TOLERANCE = 0.09;

const scratchBox = new THREE.Box3();
const scratchSize = new THREE.Vector3();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cellKey(x: number, z: number): string {
  return `${x},${z}`;
}

interface OccupiedCell {
  tile: PlacedTile;
  gx: number;
  gz: number;
}

function buildCellOccupancy(
  map: GeneratedMap,
): Map<string, OccupiedCell> | null {
  const gp = map.debugInfo["gridPath"];
  if (!Array.isArray(gp) || gp.length !== map.tiles.length) return null;

  const byCell = new Map<string, OccupiedCell>();
  for (let i = 0; i < map.tiles.length; i++) {
    const cell = gp[i] as GridCell;
    const tile = map.tiles[i]!;
    const k = cellKey(cell.x, cell.z);
    if (!byCell.has(k)) {
      byCell.set(k, { tile, gx: cell.x, gz: cell.z });
    }
  }
  return byCell;
}

/** One coplanar 2×2 block on the procgen grid (anchor = low-X, low-Z corner). */
export interface ProcgenFlatGridQuad {
  anchorGx: number;
  anchorGz: number;
  cx: number;
  cz: number;
  minDeckY: number;
}

function isProcgenRampTile(tile: PlacedTile): boolean {
  return (
    tile.tileType === "ramp_right_wall" || tile.tileType === "ramp_left_wall"
  );
}

/** Grid cells sharing an edge with the 2×2 anchor block (not corners-only). */
const EDGE_OFFSETS: readonly [number, number][] = [
  [-1, 0],
  [-1, 1],
  [2, 0],
  [2, 1],
  [0, -1],
  [1, -1],
  [0, 2],
  [1, 2],
];

/**
 * Unit direction from quad center toward the closest ramp tile touching the quad edge.
 */
function closestEdgeAdjacentRampDir(
  byCell: Map<string, OccupiedCell>,
  anchorGx: number,
  anchorGz: number,
  cx: number,
  cz: number,
): { nx: number; nz: number } | null {
  let best: { dist: number; nx: number; nz: number } | null = null;
  for (const [dx, dz] of EDGE_OFFSETS) {
    const ox = anchorGx + dx;
    const oz = anchorGz + dz;
    const oc = byCell.get(cellKey(ox, oz));
    if (!oc || !isProcgenRampTile(oc.tile)) continue;
    const def = getTileDefinition(oc.tile.tileType);
    const d = deckCenterWorldFromPivot(oc.tile.position, oc.tile.rotationY, def);
    const wx = d.x - cx;
    const wz = d.z - cz;
    const dist = Math.hypot(wx, wz);
    if (dist < 0.08) continue;
    const nx = wx / dist;
    const nz = wz / dist;
    if (!best || dist < best.dist) best = { dist, nx, nz };
  }
  return best ? { nx: best.nx, nz: best.nz } : null;
}

/**
 * Pinch local X/Z (applied before Y rotation) toward ramps — axis aligned in local space so
 * the mesh narrows along the approach direction without world shear.
 */
function rampPinchLocalScaleXZ(
  rotationY: number,
  dirWorldX: number,
  dirWorldZ: number,
): { x: number; z: number } {
  const nx = dirWorldX;
  const nz = dirWorldZ;
  const c = Math.cos(-rotationY);
  const s = Math.sin(-rotationY);
  const dxL = c * nx + s * nz;
  const dzL = -s * nx + c * nz;
  const floor = 0.46;
  return {
    x: THREE.MathUtils.lerp(1, floor, Math.abs(dxL)),
    z: THREE.MathUtils.lerp(1, floor, Math.abs(dzL)),
  };
}

function enumerateProcgenFlatGridQuadsFromOccupancy(
  byCell: Map<string, OccupiedCell>,
): ProcgenFlatGridQuad[] {
  const out: ProcgenFlatGridQuad[] = [];

  for (const { gx, gz } of byCell.values()) {
    const x = gx;
    const z = gz;
    const c00 = byCell.get(cellKey(x, z));
    const c10 = byCell.get(cellKey(x + 1, z));
    const c01 = byCell.get(cellKey(x, z + 1));
    const c11 = byCell.get(cellKey(x + 1, z + 1));
    if (!c00 || !c10 || !c01 || !c11) continue;

    const quad = [c00, c10, c01, c11];
    const decks = quad.map(({ tile: t }) => {
      const def = getTileDefinition(t.tileType);
      return deckCenterWorldFromPivot(t.position, t.rotationY, def);
    });

    let minY = Infinity;
    let maxY = -Infinity;
    for (const d of decks) {
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    }
    if (maxY - minY > DECK_Y_TOLERANCE) continue;

    let cx = 0;
    let cz = 0;
    for (const d of decks) {
      cx += d.x;
      cz += d.z;
    }
    cx /= 4;
    cz /= 4;

    out.push({
      anchorGx: x,
      anchorGz: z,
      cx,
      cz,
      minDeckY: minY,
    });
  }

  return out;
}

/**
 * Axis-aligned 2×2 blocks where all four grid cells are occupied and deck heights match.
 * Each physical block can be discovered from four cells; we emit once per anchor visit (same result).
 */
export function enumerateProcgenFlatGridQuads(map: GeneratedMap): ProcgenFlatGridQuad[] {
  const byCell = buildCellOccupancy(map);
  if (!byCell) return [];
  return enumerateProcgenFlatGridQuadsFromOccupancy(byCell);
}

/**
 * Procgen-debug undermap islands: {@link enumerateProcgenFlatGridQuads}, scaled smaller than
 * full-course undermap supports.
 */
export function computeProcgenUndermapQuadSlots(
  map: GeneratedMap,
): UndermapIslandSlot[] {
  if (!assetRegistry.isReady(ASSET_KEY)) return [];

  const probe = assetRegistry.getModelClone(ASSET_KEY);
  if (!probe) return [];

  probe.position.set(0, 0, 0);
  probe.rotation.set(0, 0, 0);
  probe.scale.set(1, 1, 1);
  probe.updateMatrixWorld(true);
  scratchBox.setFromObject(probe);
  scratchBox.getSize(scratchSize);
  const foot = Math.max(scratchSize.x, scratchSize.z, 0.001);

  const byCell = buildCellOccupancy(map);
  if (!byCell) return [];

  const quads = enumerateProcgenFlatGridQuadsFromOccupancy(byCell);
  const slots: UndermapIslandSlot[] = [];

  for (const q of quads) {
    const rng = mulberry32(
      hashString(`${map.seed}|undermapGridQuad|${q.anchorGx}|${q.anchorGz}`),
    );
    const underGap = 0.07 + rng() * 0.06;
    let targetFoot = TILE_SIZE * (3.88 + rng() * 0.46);
    const rotationY = rng() * Math.PI * 2;

    const rampDir = closestEdgeAdjacentRampDir(
      byCell,
      q.anchorGx,
      q.anchorGz,
      q.cx,
      q.cz,
    );

    let scaleAxisMul: { x: number; z: number } | undefined;
    if (rampDir) {
      scaleAxisMul = rampPinchLocalScaleXZ(rotationY, rampDir.nx, rampDir.nz);
      targetFoot *= 0.88;
    }

    const scale = targetFoot / foot;

    slots.push({
      x: q.cx,
      z: q.cz,
      topY: q.minDeckY - underGap,
      scale,
      rotationY,
      halfWidthWorld: targetFoot * 0.62,
      ...(scaleAxisMul ? { scaleAxisMul } : {}),
    });
  }

  return slots;
}
