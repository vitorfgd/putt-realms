import * as THREE from "three";
import type { AssetKey } from "../art/AssetRegistry";
import { assetRegistry } from "../art/AssetRegistry";
import { LANE_WIDTH, TILE_SIZE } from "./TileDimensions";
import type { GeneratedLevel } from "./LevelTypes";
import type { UndermapIslandSlot } from "./undermapIslands";

/** Optional decor — copy these GLBs into `public/assets/models/` */
export const ISLAND_DECOR_ASSET_KEYS = [
  "decor_fan_cluster",
  "decor_fantasy_crystal_rock",
  "decor_fantasy_pine_tree",
  "decor_small_mushroom",
] as const satisfies readonly AssetKey[];

const SCRATCH_BOX = new THREE.Box3();
const SCRATCH_SIZE = new THREE.Vector3();

/** Clearance from tile centers — props must stay visibly outside the playable route. */
const DECK_EXCLUDE_R =
  Math.hypot(TILE_SIZE / 2, LANE_WIDTH / 2) + 1.8;

/** Nudge island-top samples down so mesh bases meet the support surface. */
const ISLAND_SURFACE_BIAS_Y = -0.12;

/**
 * Push all décor slightly into the ground after bbox snap (fixes GLB pivots that hover).
 */
const DECOR_GROUND_PENETRATION_Y = 0.38;

/**
 * Extra downward shift for the large fan / tree cluster GLB (wide base vs floor).
 */
const FAN_CLUSTER_EXTRA_SINK_Y = 1.62;

/** Minimum gap between inscribed decor footprint disks (world units). */
const DECOR_DISK_CLEARANCE = 1.12;

/** Extra fudge on bbox half-extent after scale (XZ). */
const FOOTPRINT_RADIAL_FUDGE = 0.42;

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

function minDistSqToTiles(x: number, z: number, level: GeneratedLevel): number {
  let best = Infinity;
  for (const t of level.tiles) {
    const dx = x - t.worldX;
    const dz = z - t.worldZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return best;
}

function isOutsidePlayableRoute(
  x: number,
  z: number,
  level: GeneratedLevel,
): boolean {
  return (
    minDistSqToTiles(x, z, level) >= DECK_EXCLUDE_R * DECK_EXCLUDE_R
  );
}

function applyShadowMode(
  root: THREE.Object3D,
  mode: "full" | "receiveOnly" | "none",
): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (mode === "none") {
      m.castShadow = false;
      m.receiveShadow = false;
    } else if (mode === "receiveOnly") {
      m.castShadow = false;
      m.receiveShadow = true;
    } else {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

function disposeDecorClone(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) {
      for (const x of mat) x.dispose();
    } else {
      mat.dispose();
    }
  });
}

function scaleAndSnapToGround(
  node: THREE.Object3D,
  x: number,
  z: number,
  groundY: number,
  targetHeight: number,
  rotY: number,
): void {
  node.position.set(0, 0, 0);
  node.rotation.set(0, rotY, 0);
  node.scale.set(1, 1, 1);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  SCRATCH_BOX.getSize(SCRATCH_SIZE);
  const h = Math.max(SCRATCH_SIZE.y, 0.02);
  const s = targetHeight / h;
  node.scale.setScalar(s);
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  node.position.set(x, groundY - SCRATCH_BOX.min.y, z);
}

function trySampleNearIsland(
  slot: UndermapIslandSlot,
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
): { x: number; z: number } | null {
  for (let a = 0; a < maxAttempts; a++) {
    const ang = rng() * Math.PI * 2;
    const rad = slot.halfWidthWorld * (0.34 + rng() * 0.48);
    const x = slot.x + Math.cos(ang) * rad;
    const z = slot.z + Math.sin(ang) * rad;
    if (isOutsidePlayableRoute(x, z, level)) return { x, z };
  }
  return null;
}

/** Ground Y when no undermap slot is near — well below the course void shelf. */
function voidShelfGroundY(rng: () => number): number {
  return -2.38 - rng() * 1.05;
}

/**
 * Uses support-island tops when xz is inside their footprint; avoids props floating on
 * a high arbitrary shelf far from meshes.
 */
function resolveDecorGroundY(
  x: number,
  z: number,
  slots: readonly UndermapIslandSlot[],
  shelfFallback: number,
): number {
  let bestY = shelfFallback;
  let bestD = Infinity;
  for (const s of slots) {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.hypot(dx, dz);
    const reach = s.halfWidthWorld * 1.48 + 3.8;
    if (d <= reach && d < bestD) {
      bestD = d;
      bestY = s.topY + ISLAND_SURFACE_BIAS_Y;
    }
  }
  return bestY;
}

function trySampleOffDeck(
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
): { x: number; z: number } | null {
  const b = level.bounds;
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;
  const pad = Math.max(26, spanX, spanZ) * 0.72;
  for (let a = 0; a < maxAttempts; a++) {
    const x = b.minX - pad + rng() * (spanX + pad * 2);
    const z = b.minZ - pad + rng() * (spanZ + pad * 2);
    if (isOutsidePlayableRoute(x, z, level)) return { x, z };
  }
  return null;
}

type DecorKey = (typeof ISLAND_DECOR_ASSET_KEYS)[number];

function approximateClearanceRadius(key: DecorKey, targetHeight: number): number {
  switch (key) {
    case "decor_fan_cluster":
      return 3.05 + targetHeight * 0.065;
    case "decor_fantasy_pine_tree":
      return 1.42 + targetHeight * 0.11;
    case "decor_fantasy_crystal_rock":
      return 0.95 + targetHeight * 0.19;
    case "decor_small_mushroom":
      return 0.58 + targetHeight * 0.14;
    default:
      return 1.1;
  }
}

function spacedFromExisting(
  x: number,
  z: number,
  rSelf: number,
  placed: readonly { x: number; z: number; r: number }[],
): boolean {
  const needSq = DECOR_DISK_CLEARANCE;
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.z;
    const sep = rSelf + p.r + needSq;
    if (dx * dx + dz * dz < sep * sep) return false;
  }
  return true;
}

function measureFootprintRadiusAfterScale(node: THREE.Object3D): number {
  node.updateMatrixWorld(true);
  SCRATCH_BOX.setFromObject(node);
  SCRATCH_BOX.getSize(SCRATCH_SIZE);
  return Math.max(SCRATCH_SIZE.x, SCRATCH_SIZE.z) * 0.5 + FOOTPRINT_RADIAL_FUDGE;
}

function tryPlaceDecor(
  key: DecorKey,
  level: GeneratedLevel,
  slots: readonly UndermapIslandSlot[],
  rng: () => number,
  targetHeight: number,
  shadow: "full" | "receiveOnly" | "none",
  preferIsland: boolean,
  /** Visual shelf height outside the playable route */
  shelfGroundY: number,
  extraSinkY: number,
  placed: { x: number; z: number; r: number }[],
  maxAttempts: number,
): THREE.Object3D | null {
  if (!assetRegistry.isReady(key)) return null;

  const rPre = approximateClearanceRadius(key, targetHeight);
  const hasSlots = slots.length > 0;
  const singleSampleIsland = (): { x: number; z: number; groundY: number } | null => {
    if (hasSlots && preferIsland) {
      const slot = slots[Math.floor(rng() * slots.length)]!;
      const xz = trySampleNearIsland(slot, level, rng, 60);
      if (xz) {
        const gy = resolveDecorGroundY(xz.x, xz.z, slots, slot.topY + ISLAND_SURFACE_BIAS_Y);
        return { ...xz, groundY: gy };
      }
    }
    const xzOff = trySampleOffDeck(level, rng, 90);
    if (xzOff) {
      const gy = resolveDecorGroundY(xzOff.x, xzOff.z, slots, shelfGroundY);
      return { ...xzOff, groundY: gy };
    }
    return null;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sample = singleSampleIsland();
    if (!sample) continue;
    if (!spacedFromExisting(sample.x, sample.z, rPre, placed)) continue;

    const node = assetRegistry.getModelClone(key);
    if (!node) return null;

    const rotY = rng() * Math.PI * 2;
    scaleAndSnapToGround(
      node,
      sample.x,
      sample.z,
      sample.groundY,
      targetHeight,
      rotY,
    );
    node.position.y -= DECOR_GROUND_PENETRATION_Y;
    if (extraSinkY !== 0) node.position.y -= extraSinkY;

    if (
      key === "decor_fantasy_pine_tree" ||
      key === "decor_fan_cluster" ||
      key === "decor_fantasy_crystal_rock"
    ) {
      node.userData.decorOccludesCamera = true;
    }

    const rPost = Math.max(rPre, measureFootprintRadiusAfterScale(node));
    if (!spacedFromExisting(sample.x, sample.z, rPost, placed)) {
      disposeDecorClone(node);
      continue;
    }

    placed.push({ x: sample.x, z: sample.z, r: rPost });
    applyShadowMode(node, shadow);
    return node;
  }

  return null;
}

/**
 * Scatter fantasy props around under-island masses and in a wide ring off the tile deck.
 * Never parents into the course group — visual-only, no gameplay coupling.
 */
export function createIslandSurroundDecor(
  level: GeneratedLevel,
  slots: readonly UndermapIslandSlot[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = "IslandSurroundDecor";

  const anyReady = ISLAND_DECOR_ASSET_KEYS.some((k) => assetRegistry.isReady(k));
  if (!anyReady) return group;

  const seedStr = `${level.procgenSeed ?? level.id}|${level.levelIndex}|decorScatter`;
  const rng = mulberry32(hashString(seedStr));

  const b = level.bounds;
  const span = Math.max(
    24,
    b.maxX - b.minX,
    b.maxZ - b.minZ,
  );
  const density = Math.max(0.55, Math.min(1.25, span / 40));

  const nMush = Math.round(5 * density);
  const nCrystal = Math.round(4 * density);
  /** More pines; spacing + retries cap how many actually land. */
  const nTree = 6 + Math.round(9 * density);
  const nFan = Math.min(2, Math.round(1.25 * density));

  /** Deep void shelf when props miss every support island (see {@link resolveDecorGroundY}). */
  const shelfGround = (): number => voidShelfGroundY(rng);

  type Job = {
    key: DecorKey;
    h: number;
    shadow: "full" | "receiveOnly" | "none";
    preferIsland: boolean;
    /** Fallback / off-mesa shelf height only */
    shelfGround: () => number;
    extraSinkY: number;
  };

  const jobs: Job[] = [];

  for (let i = 0; i < nMush; i++) {
    jobs.push({
      key: "decor_small_mushroom",
      h: 0.55 + rng() * 0.62,
      shadow: "full",
      preferIsland: true,
      shelfGround,
      extraSinkY: 0,
    });
  }
  for (let i = 0; i < nCrystal; i++) {
    jobs.push({
      key: "decor_fantasy_crystal_rock",
      h: 1.25 + rng() * 1.75,
      shadow: "full",
      preferIsland: true,
      shelfGround,
      extraSinkY: 0,
    });
  }
  for (let i = 0; i < nTree; i++) {
    jobs.push({
      key: "decor_fantasy_pine_tree",
      h: 5.0 + rng() * 5.8,
      shadow: "full",
      preferIsland: true,
      shelfGround,
      extraSinkY: 0,
    });
  }
  for (let i = 0; i < nFan; i++) {
    jobs.push({
      key: "decor_fan_cluster",
      h: 8.5 + rng() * 4.5,
      shadow: "full",
      preferIsland: true,
      shelfGround,
      extraSinkY: FAN_CLUSTER_EXTRA_SINK_Y,
    });
  }

  /** Fisher–Yates shuffle job order so clustering isn’t type-sorted */
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = jobs[i]!;
    jobs[i] = jobs[j]!;
    jobs[j] = tmp;
  }

  const placed: { x: number; z: number; r: number }[] = [];
  const placeAttempts = 320;

  for (const job of jobs) {
    const node = tryPlaceDecor(
      job.key,
      level,
      slots,
      rng,
      job.h,
      job.shadow,
      job.preferIsland,
      job.shelfGround(),
      job.extraSinkY,
      placed,
      placeAttempts,
    );
    if (node) group.add(node);
  }

  return group;
}
