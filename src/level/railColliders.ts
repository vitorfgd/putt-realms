import type { PlacedTile, RailCapsule } from "./LevelTypes";
import {
  LANE_WIDTH,
  RAIL_THICKNESS,
  TILE_SIZE,
} from "./TileDimensions";

const DECK_HALF_W = (LANE_WIDTH * 0.97) * 0.5;

function railSideOffset(): number {
  return DECK_HALF_W - RAIL_THICKNESS * 0.5;
}

function railOriginXZ(
  tile: Pick<
    PlacedTile,
    "worldX" | "worldZ" | "railOriginX" | "railOriginZ"
  >,
): { x: number; z: number } {
  return {
    x: tile.railOriginX ?? tile.worldX,
    z: tile.railOriginZ ?? tile.worldZ,
  };
}

function localToWorldXZ(
  lx: number,
  lz: number,
  tile: Pick<
    PlacedTile,
    "worldX" | "worldZ" | "railOriginX" | "railOriginZ" | "rotationY"
  >,
): { x: number; z: number } {
  const o = railOriginXZ(tile);
  const th = tile.rotationY;
  const fx = Math.sin(th);
  const fz = Math.cos(th);
  const rx = Math.cos(th);
  const rz = -Math.sin(th);
  return {
    x: o.x + lx * rx + lz * fx,
    z: o.z + lx * rz + lz * fz,
  };
}

function pushSeg(
  out: RailCapsule[],
  tile: PlacedTile,
  lax: number,
  laz: number,
  lbx: number,
  lbz: number,
): void {
  const a = localToWorldXZ(lax, laz, tile);
  const b = localToWorldXZ(lbx, lbz, tile);
  out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
}

function parallelPair(tile: PlacedTile, out: RailCapsule[]): void {
  const xOff = railSideOffset();
  const hz = TILE_SIZE * 0.5;
  pushSeg(out, tile, -xOff, -hz, -xOff, hz);
  pushSeg(out, tile, xOff, -hz, xOff, hz);
}

function cornerRails(tile: PlacedTile, out: RailCapsule[]): void {
  const { sx, sz } = tile.railS ?? { sx: -1, sz: -1 };
  const side = railSideOffset();
  const hz = TILE_SIZE * 0.5;
  pushSeg(out, tile, sx * side, -hz, sx * side, hz);
  pushSeg(out, tile, -hz, sz * side, hz, sz * side);
}

function curveRails(tile: PlacedTile, out: RailCapsule[]): void {
  const { sx, sz } = tile.railS ?? { sx: -1, sz: -1 };
  const outer = railSideOffset();
  const n = 20;
  let px = 0;
  let pz = 0;
  let first = true;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * (Math.PI / 2);
    const lx = Math.cos(t) * outer * sx;
    const lz = Math.sin(t) * outer * sz;
    if (!first) {
      const a = localToWorldXZ(px, pz, tile);
      const b = localToWorldXZ(lx, lz, tile);
      out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
    first = false;
    px = lx;
    pz = lz;
  }
}

/**
 * Centerlines of wood rails in world xz — must stay in sync with {@link ./tiles/TileKit} placement.
 */
export function buildRailColliders(tiles: readonly PlacedTile[]): RailCapsule[] {
  const out: RailCapsule[] = [];
  for (const tile of tiles) {
    switch (tile.type) {
      case "straight":
      case "start":
      case "hole":
        parallelPair(tile, out);
        break;
      case "floor":
        break;
      case "corner":
        cornerRails(tile, out);
        break;
      case "curve":
        curveRails(tile, out);
        break;
      default:
        break;
    }
  }
  return out;
}
