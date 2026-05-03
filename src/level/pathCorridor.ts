import { BALL_RADIUS } from "../core/Constants";
import type { GridCell } from "./pathGen";
import type { PlacedTile } from "./LevelTypes";
import { buildRailColliders } from "./railColliders";

function worldXZ(
  p: GridCell,
  cx: number,
  cz: number,
  tileSize: number,
): { x: number; z: number } {
  return {
    x: (p.x - cx) * tileSize,
    z: (p.z - cz) * tileSize,
  };
}

function distPointSeg2(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-12 ? (apx * abx + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

function minDistToRails(
  px: number,
  pz: number,
  rails: { ax: number; az: number; bx: number; bz: number }[],
): number {
  let m = Infinity;
  for (const s of rails) {
    m = Math.min(m, distPointSeg2(px, pz, s.ax, s.az, s.bx, s.bz));
  }
  return m;
}

/**
 * Rejects layouts where sampled points along the path corridor sit too close to
 * wood rail capsules (catches mis-tuned bends / overlaps that fully block the ball).
 */
export function pathHasPlayableCorridor(
  path: GridCell[],
  tiles: readonly PlacedTile[],
  cx: number,
  cz: number,
  tileSize: number,
): boolean {
  if (path.length < 2) return true;

  const rails = buildRailColliders(tiles);
  const need = BALL_RADIUS + 0.06;
  /** Lateral offsets from segment centerline (world m) — stay inside typical deck */
  const laterals = [0, 0.5, -0.5, 1.05, -1.05, 1.55, -1.55];

  for (let i = 0; i < path.length - 1; i++) {
    const w0 = worldXZ(path[i]!, cx, cz, tileSize);
    const w1 = worldXZ(path[i + 1]!, cx, cz, tileSize);
    const dx = w1.x - w0.x;
    const dz = w1.z - w0.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const fx = dx / len;
    const fz = dz / len;
    const px = -fz;
    const pz = fx;

    for (const st of [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1]) {
      const bx = w0.x + st * dx;
      const bz = w0.z + st * dz;
      for (const lat of laterals) {
        const qx = bx + lat * px;
        const qz = bz + lat * pz;
        const d = minDistToRails(qx, qz, rails);
        if (d < need) return false;
      }
    }
  }

  return true;
}
