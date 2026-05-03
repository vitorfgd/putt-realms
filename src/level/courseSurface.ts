import type {
  CourseSurface,
  CourseSurfacePatch,
  PlacedTile,
} from "./LevelTypes";
import { RAMP_HEIGHT, TILE_LENGTH, TILE_WIDTH } from "../procgen/TileCatalog";
import { TILE_SIZE } from "./TileDimensions";

const SUPPORT_EPS = 0.04;

export interface CourseSurfaceSample {
  y: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  gradX: number;
  gradZ: number;
  patch: CourseSurfacePatch;
}

function localXZ(
  patch: Pick<CourseSurfacePatch, "cx" | "cz" | "rotationY">,
  x: number,
  z: number,
): { lx: number; lz: number } {
  const dx = x - patch.cx;
  const dz = z - patch.cz;
  const th = patch.rotationY;
  const fx = Math.sin(th);
  const fz = Math.cos(th);
  const rx = Math.cos(th);
  const rz = -Math.sin(th);
  return {
    lx: dx * rx + dz * rz,
    lz: dx * fx + dz * fz,
  };
}

function samplePatch(
  patch: CourseSurfacePatch,
  x: number,
  z: number,
): CourseSurfaceSample | null {
  const local = localXZ(patch, x, z);
  if (
    Math.abs(local.lx) > patch.halfWidth + SUPPORT_EPS ||
    Math.abs(local.lz) > patch.halfLength + SUPPORT_EPS
  ) {
    return null;
  }

  if (patch.kind === "ramp") {
    const lowY = patch.lowY ?? patch.y;
    const highY = patch.highY ?? lowY + RAMP_HEIGHT;
    const u = Math.max(
      0,
      Math.min(1, (local.lz + patch.halfLength) / (patch.halfLength * 2)),
    );
    const rise = highY - lowY;
    const y = lowY + rise * u;
    const slopeLocalZ = rise / Math.max(0.001, patch.halfLength * 2);
    const th = patch.rotationY;
    const fx = Math.sin(th);
    const fz = Math.cos(th);
    const gradX = slopeLocalZ * fx;
    const gradZ = slopeLocalZ * fz;
    const normalScale = 1 / Math.sqrt(1 + gradX * gradX + gradZ * gradZ);
    return {
      y,
      normalX: -gradX * normalScale,
      normalY: normalScale,
      normalZ: -gradZ * normalScale,
      gradX,
      gradZ,
      patch,
    };
  }

  return {
    y: patch.y,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    gradX: 0,
    gradZ: 0,
    patch,
  };
}

export function sampleCourseSurface(
  surface: CourseSurface | undefined,
  x: number,
  z: number,
): CourseSurfaceSample | null {
  if (!surface) return null;
  let best: CourseSurfaceSample | null = null;
  for (const patch of surface.patches) {
    const hit = samplePatch(patch, x, z);
    if (!hit) continue;
    if (!best || hit.y > best.y) best = hit;
  }
  return best;
}

export function buildFlatCourseSurfaceFromTiles(
  tiles: readonly PlacedTile[],
): CourseSurface {
  return {
    patches: tiles.map((tile) => ({
      kind: "flat",
      cx: tile.worldX,
      cz: tile.worldZ,
      y: tile.worldY ?? 0,
      halfWidth: TILE_SIZE / 2,
      halfLength: TILE_SIZE / 2,
      rotationY: tile.rotationY,
    })),
  };
}

export function flatProcgenPatch(
  cx: number,
  cz: number,
  y: number,
  rotationY: number,
): CourseSurfacePatch {
  return {
    kind: "flat",
    cx,
    cz,
    y,
    halfWidth: TILE_WIDTH / 2,
    halfLength: TILE_LENGTH / 2,
    rotationY,
  };
}

export function rampProcgenPatch(
  cx: number,
  cz: number,
  lowY: number,
  rotationY: number,
): CourseSurfacePatch {
  return {
    kind: "ramp",
    cx,
    cz,
    y: lowY,
    lowY,
    highY: lowY + RAMP_HEIGHT,
    halfWidth: TILE_WIDTH / 2,
    halfLength: TILE_LENGTH / 2,
    rotationY,
  };
}
