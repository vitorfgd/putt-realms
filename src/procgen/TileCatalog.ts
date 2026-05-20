import {
  rotateFlatOffset as rotateFlatOffsetPlain,
  type Vec3Like,
} from "../core/math";
import type { Footprint, TileType } from "./MapGenerationTypes";
import { SocketDirection } from "./MapGenerationTypes";

/** World tile length. Source art is 2x2 and is scaled into this square footprint. */
export const TILE_LENGTH = 6;
/** World tile width. Must match length so adjacent 2x2 source tiles stay on-grid. */
export const TILE_WIDTH = TILE_LENGTH;
/**
 * Clear space (world units) between the two parallel straight lanes in double-row layout,
 * measured between the inner long edges of the two pieces (see {@link doubleRowDeckCenterX}).
 */
export const DOUBLE_ROW_SIDE_GAP = 0;

/** World X of each lane’s deck origin: right lane +, left lane − (symmetric about course center). */
export function doubleRowDeckCenterX(isRightLane: boolean): number {
  const half = (TILE_WIDTH + DOUBLE_ROW_SIDE_GAP) / 2;
  return isRightLane ? half : -half;
}
/**
 * World vertical delta for ramp tiles.
 *
 * The current ramp art is authored as a 2x2 tile with a 1-unit floor rise.
 * Procgen scales the 2-unit source length to `TILE_LENGTH` (6 world units), so
 * the matching world-space floor delta is 3.
 */
export const RAMP_HEIGHT = 3;

export interface TileDefinition {
  tileType: TileType;
  modelKey: string;
  footprint: Footprint;
  /** Incoming socket in tile-local space (see {@link SocketDirection}). */
  entrySocket: SocketDirection;
  /** Outgoing socket in tile-local space. */
  exitSocket: SocketDirection;
  /**
   * Vector from **deck / lane origin** (center used by gameplay meshes) to **artist pivot** (top-left-most),
   * in unrotated tile-local space (+Z = forward along lane).
   *
   * If meshes are re-exported with a different pivot, adjust only these offsets — gameplay stays deck-center based.
   */
  pivotOffsetFromDeckOrigin: Vec3Like;
  /**
   * Y change (world units) from this tile's **entry** elevation to its **exit** elevation.
   * 0 for all flat tiles; +{@link RAMP_HEIGHT} for ramp-up tiles.
   * The solver accumulates this to track the running elevation along the course.
   */
  exitElevationDelta: number;
  difficultyWeight: number;
  tags: string[];
}

/**
 * Artist pivot convention: top-left-most corner of the tile footprint in local XZ.
 *   "Top"  = exit end (+local Z, away from entry).
 *   "Left" = wall-free side (−local X for right-wall tiles).
 * Deck origin = lane centre on the grass plane.
 * pivot_world = deckOrigin_world + rotateY(pivotOffsetFromDeckOrigin, rotationY).
 *
 * Model geometry extends +X (wall side) and −Z (backward from pivot) in local space,
 * so the full footprint is [0..+TILE_WIDTH] × [0..−TILE_LENGTH] from the pivot.
 */
export const TILE_CATALOG: Record<TileType, TileDefinition> = {
  straight_right_wall: {
    tileType: "straight_right_wall",
    modelKey: "tile_straight_rw",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    // Top-left corner: model extends +X (wall right) and −Z (backward) from this offset.
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1,
    tags: ["straight", "right_wall"],
  },
  convex_right_wall: {
    tileType: "convex_right_wall",
    modelKey: "tile_convex_rw",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosX,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1.5,
    tags: ["curve", "convex", "right_wall"],
  },
  concave_right_wall: {
    tileType: "concave_right_wall",
    modelKey: "tile_concave_rw",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.NegX,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1.5,
    tags: ["curve", "concave", "right_wall"],
  },
  ramp_right_wall: {
    tileType: "ramp_right_wall",
    modelKey: "tile_ramp_rw",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    // Ramp rises RAMP_HEIGHT from entry (low end / pivot) to exit (high end).
    exitElevationDelta: RAMP_HEIGHT,
    difficultyWeight: 2,
    tags: ["ramp", "right_wall"],
  },
  ramp_left_wall: {
    tileType: "ramp_left_wall",
    modelKey: "tile_ramp_lw",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    // Mirror of ramp_right_wall: same elevation change, wall on −X side.
    exitElevationDelta: RAMP_HEIGHT,
    difficultyWeight: 2,
    tags: ["ramp", "left_wall"],
  },
  floor_plain: {
    tileType: "floor_plain",
    modelKey: "tile_floor_plain",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 0.5,
    tags: ["floor", "plain"],
  },
  start_placeholder: {
    tileType: "start_placeholder",
    modelKey: "tile_start_ph",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1,
    tags: ["start"],
  },
  hole_placeholder: {
    tileType: "hole_placeholder",
    modelKey: "tile_hole_ph",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1,
    tags: ["hole"],
  },
  dead_end_cap: {
    tileType: "dead_end_cap",
    modelKey: "tile_hole_ph",
    footprint: { halfWidth: TILE_WIDTH / 2, halfLength: TILE_LENGTH / 2 },
    entrySocket: SocketDirection.NegZ,
    exitSocket: SocketDirection.PosZ,
    pivotOffsetFromDeckOrigin: { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
    exitElevationDelta: 0,
    difficultyWeight: 1,
    tags: ["dead_end", "portal"],
  },
};

export function getTileDefinition(type: TileType): TileDefinition {
  return TILE_CATALOG[type];
}

/** Rotate an xz offset by yaw (Three.js Y rotation). */
type Vec3Target = Vec3Like & {
  set?: (x: number, y: number, z: number) => unknown;
};

export function rotateFlatOffset<T extends Vec3Target>(
  offset: Vec3Like,
  rotationY: number,
  target: T,
): T;
export function rotateFlatOffset(
  offset: Vec3Like,
  rotationY: number,
): Vec3Like;
export function rotateFlatOffset(
  offset: Vec3Like,
  rotationY: number,
  target?: Vec3Target,
): Vec3Like {
  const next = rotateFlatOffsetPlain(offset, rotationY);
  if (!target) return next;
  if (target.set) {
    target.set(next.x, next.y, next.z);
  } else {
    target.x = next.x;
    target.y = next.y;
    target.z = next.z;
  }
  return target;
}

/** deck_world + rotate(offset) === pivot_world. Used only for web/debug compatibility. */
export function pivotWorldFromDeckCenter(
  deck: Vec3Like,
  rotationY: number,
  def: TileDefinition,
): Vec3Like;
export function pivotWorldFromDeckCenter<T extends Vec3Target>(
  deck: Vec3Like,
  rotationY: number,
  def: TileDefinition,
  out: T,
): T;
export function pivotWorldFromDeckCenter(
  deck: Vec3Like,
  rotationY: number,
  def: TileDefinition,
  out?: Vec3Target,
): Vec3Like {
  const offset = rotateFlatOffsetPlain(def.pivotOffsetFromDeckOrigin, rotationY);
  const next = {
    x: deck.x + offset.x,
    y: deck.y + offset.y,
    z: deck.z + offset.z,
  };
  if (!out) return next;
  if (out.set) {
    out.set(next.x, next.y, next.z);
  } else {
    out.x = next.x;
    out.y = next.y;
    out.z = next.z;
  }
  return out;
}

/** deck_world + rotate(offset) === pivot_world */
export function deckCenterWorldFromPivot(
  pivot: Vec3Like,
  rotationY: number,
  def: TileDefinition,
): Vec3Like;
export function deckCenterWorldFromPivot<T extends Vec3Target>(
  pivot: Vec3Like,
  rotationY: number,
  def: TileDefinition,
  out: T,
): T;
export function deckCenterWorldFromPivot(
  pivot: Vec3Like,
  rotationY: number,
  def: TileDefinition,
  out?: Vec3Target,
): Vec3Like {
  const offset = rotateFlatOffsetPlain(def.pivotOffsetFromDeckOrigin, rotationY);
  const next = {
    x: pivot.x - offset.x,
    y: pivot.y - offset.y,
    z: pivot.z - offset.z,
  };
  if (!out) return next;
  if (out.set) {
    out.set(next.x, next.y, next.z);
  } else {
    out.x = next.x;
    out.y = next.y;
    out.z = next.z;
  }
  return out;
}
