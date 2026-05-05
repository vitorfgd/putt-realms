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
  const y = tile.worldY ?? 0;
  out.push({
    ax: a.x,
    az: a.z,
    bx: b.x,
    bz: b.z,
    yMin: y - 0.35,
    yMax: y + 1.8,
  });
}

function parallelPair(tile: PlacedTile, out: RailCapsule[]): void {
  const xOff = railSideOffset();
  const hz = TILE_SIZE * 0.5;
  pushSeg(out, tile, -xOff, -hz, -xOff, hz);
  pushSeg(out, tile, xOff, -hz, xOff, hz);
}

function explicitRailSides(tile: PlacedTile, out: RailCapsule[]): boolean {
  if (tile.railSides === undefined) return false;
  const xOff = railSideOffset();
  const zOff = railSideOffset();
  const h = TILE_SIZE * 0.5;
  for (const side of tile.railSides) {
    switch (side) {
      case "left":
        pushSeg(out, tile, -xOff, -h, -xOff, h);
        break;
      case "right":
        pushSeg(out, tile, xOff, -h, xOff, h);
        break;
      case "front":
        pushSeg(out, tile, -h, zOff, h, zOff);
        break;
      case "back":
        pushSeg(out, tile, -h, -zOff, h, -zOff);
        break;
    }
  }
  return true;
}

function explicitWorldRailSides(tile: PlacedTile, out: RailCapsule[]): boolean {
  if (tile.railWorldSides === undefined) return false;
  const h = TILE_SIZE * 0.5;
  const side = railSideOffset();
  const y = tile.worldY ?? 0;
  for (const raw of tile.railWorldSides) {
    const nx = Math.sign(raw.x);
    const nz = Math.sign(raw.z);
    if (nx === 0 && nz === 0) continue;
    const tx = -nz;
    const tz = nx;
    const cx = tile.worldX + nx * side;
    const cz = tile.worldZ + nz * side;
    out.push({
      ax: cx - tx * h,
      az: cz - tz * h,
      bx: cx + tx * h,
      bz: cz + tz * h,
      yMin: y - 0.35,
      yMax: y + 1.8,
    });
  }
  return true;
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
      const y = tile.worldY ?? 0;
      out.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        yMin: y - 0.35,
        yMax: y + 1.8,
      });
    }
    first = false;
    px = lx;
    pz = lz;
  }
}

/**
 * Centerlines of wood rails in world xz — must stay in sync with {@link ./tiles/TileKit} placement.
 */
function roundKey(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function mergedRail(
  item: { rail: RailCapsule; a: number; b: number },
): RailCapsule {
  const dx = item.rail.bx - item.rail.ax;
  const dz = item.rail.bz - item.rail.az;
  const len = Math.hypot(dx, dz);
  let ux = dx / len;
  let uz = dz / len;
  if (ux < -0.001 || (Math.abs(ux) < 0.001 && uz < -0.001)) {
    ux *= -1;
    uz *= -1;
  }
  const nx = -uz;
  const nz = ux;
  const line = item.rail.ax * nx + item.rail.az * nz;
  return {
    ax: ux * item.a + nx * line,
    az: uz * item.a + nz * line,
    bx: ux * item.b + nx * line,
    bz: uz * item.b + nz * line,
    yMin: item.rail.yMin,
    yMax: item.rail.yMax,
  };
}

function mergeCollinearRails(rails: RailCapsule[]): RailCapsule[] {
  const groups = new Map<string, Array<{ rail: RailCapsule; a: number; b: number }>>();
  for (const rail of rails) {
    const dx = rail.bx - rail.ax;
    const dz = rail.bz - rail.az;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) continue;
    let ux = dx / len;
    let uz = dz / len;
    if (ux < -0.001 || (Math.abs(ux) < 0.001 && uz < -0.001)) {
      ux *= -1;
      uz *= -1;
    }
    const nx = -uz;
    const nz = ux;
    const line = rail.ax * nx + rail.az * nz;
    const pa = rail.ax * ux + rail.az * uz;
    const pb = rail.bx * ux + rail.bz * uz;
    const key = [
      roundKey(ux),
      roundKey(uz),
      roundKey(line),
      roundKey(rail.yMin ?? -999),
      roundKey(rail.yMax ?? 999),
    ].join("|");
    const bucket = groups.get(key) ?? [];
    bucket.push({ rail, a: Math.min(pa, pb), b: Math.max(pa, pb) });
    groups.set(key, bucket);
  }

  const out: RailCapsule[] = [];
  for (const bucket of groups.values()) {
    bucket.sort((p, q) => p.a - q.a);
    let cur = bucket[0];
    if (!cur) continue;
    for (let i = 1; i < bucket.length; i++) {
      const next = bucket[i]!;
      if (next.a <= cur.b + 0.03) {
        cur.b = Math.max(cur.b, next.b);
      } else {
        out.push(mergedRail(cur));
        cur = next;
      }
    }
    out.push(mergedRail(cur));
  }
  return out;
}

export function buildRailColliders(tiles: readonly PlacedTile[]): RailCapsule[] {
  const out: RailCapsule[] = [];
  for (const tile of tiles) {
    if (explicitWorldRailSides(tile, out)) continue;
    if (explicitRailSides(tile, out)) continue;
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
  return mergeCollinearRails(out);
}
