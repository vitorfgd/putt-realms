import * as THREE from "three";
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
   * If meshes are re-exported with a different pivot, adjust only these offsets — gameplay stays anchor-based.
   */
  pivotOffsetFromDeckOrigin: THREE.Vector3;
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
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
    pivotOffsetFromDeckOrigin: new THREE.Vector3(
      -TILE_WIDTH / 2,
      0,
      TILE_LENGTH / 2,
    ),
    exitElevationDelta: 0,
    difficultyWeight: 1,
    tags: ["hole"],
  },
};

export function getTileDefinition(type: TileType): TileDefinition {
  return TILE_CATALOG[type];
}

/** Rotate an xz offset by yaw (Three.js Y rotation). */
export function rotateFlatOffset(
  offset: THREE.Vector3,
  rotationY: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  target.set(
    offset.x * c + offset.z * s,
    offset.y,
    -offset.x * s + offset.z * c,
  );
  return target;
}

/** deck_world + rotate(offset) === pivot_world */
export function deckCenterWorldFromPivot(
  pivot: THREE.Vector3,
  rotationY: number,
  def: TileDefinition,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  rotateFlatOffset(def.pivotOffsetFromDeckOrigin, rotationY, out);
  out.multiplyScalar(-1);
  out.add(pivot);
  return out;
}
