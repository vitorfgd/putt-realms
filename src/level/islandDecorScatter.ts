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

export type DecorKey = (typeof ISLAND_DECOR_ASSET_KEYS)[number];

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

function isFarEnoughFromAllTileDecks(
  x: number,
  z: number,
  level: GeneratedLevel,
  minDist: number,
): boolean {
  return minDistSqToTiles(x, z, level) >= minDist * minDist;
}

/** Pine trunks/canopies need extra horizontal clearance vs deck projection. */
function islandsOnlyMinDistFromDecks(
  key: DecorKey,
  propRadiusXZ: number,
): number {
  const canopy = propRadiusXZ * (key === "decor_fantasy_pine_tree" ? 1.12 : 1.02);
  const pad = key === "decor_fantasy_pine_tree" ? 0.68 : 0.2;
  return DECK_EXCLUDE_R + canopy + pad;
}

/**
 * Small procgen quad pads sit directly under deck tiles — requiring full pine/fan exclusion radius on the
 * island disk leaves **no** valid XZ samples (and post-scale checks would reject anyway). Cap clearance so an
 * annulus on the mesh can still satisfy décor placement.
 */
function maxDeckClearanceFeasibleOnSlot(slot: UndermapIslandSlot): number {
  return slot.halfWidthWorld * 0.82 + TILE_SIZE * 0.25;
}

function effectiveIslandsOnlyDeckClearance(
  key: DecorKey,
  propRadiusXZ: number,
  slot: UndermapIslandSlot,
): number {
  return Math.min(
    islandsOnlyMinDistFromDecks(key, propRadiusXZ),
    maxDeckClearanceFeasibleOnSlot(slot),
  );
}

function nearestSlotToXZ(
  slots: readonly UndermapIslandSlot[],
  x: number,
  z: number,
): UndermapIslandSlot | undefined {
  if (slots.length === 0) return undefined;
  let best = slots[0]!;
  let bestD = Infinity;
  for (const s of slots) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
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

function isLargeIslandCanopyDecor(key: DecorKey): boolean {
  return (
    key === "decor_fantasy_pine_tree" || key === "decor_fan_cluster"
  );
}

/**
 * Oriented ellipse under the slot — matches how {@link buildUndermapIslandGroup} scales the mesh
 * (rotationY + scaleAxisMul). Used so ground Y is never island-height unless XZ is actually over the pad.
 */
function xzInsideUndermapSlotFootprint(
  slot: UndermapIslandSlot,
  x: number,
  z: number,
): boolean {
  const dx = x - slot.x;
  const dz = z - slot.z;
  const c = Math.cos(-slot.rotationY);
  const sn = Math.sin(-slot.rotationY);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  const ax = slot.scaleAxisMul?.x ?? 1;
  const az = slot.scaleAxisMul?.z ?? 1;
  const rx = Math.max(0.45, slot.halfWidthWorld * 0.92 * ax);
  const rz = Math.max(0.45, slot.halfWidthWorld * 0.92 * az);
  return (lx * lx) / (rx * rx) + (lz * lz) / (rz * rz) <= 1;
}

function trySampleNearIsland(
  slot: UndermapIslandSlot,
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
): { x: number; z: number } | null {
  for (let a = 0; a < maxAttempts; a++) {
    const ang = rng() * Math.PI * 2;
    /** Footprint clip guarantees Y snap matches visible mesh — radius can stay generous. */
    const rad = slot.halfWidthWorld * (0.28 + rng() * 0.44);
    const x = slot.x + Math.cos(ang) * rad;
    const z = slot.z + Math.sin(ang) * rad;
    if (
      isOutsidePlayableRoute(x, z, level) &&
      xzInsideUndermapSlotFootprint(slot, x, z)
    ) {
      return { x, z };
    }
  }
  return null;
}

/**
 * Island-only décor: stay ≥ `minDistFromDeckCenter` from decks but **bias inward** so props sit on the
 * mesh near the fairway instead of the outer rim (where they read as floating).
 */
function trySampleIslandRimClearOfDecks(
  slot: UndermapIslandSlot,
  level: GeneratedLevel,
  rng: () => number,
  maxAttempts: number,
  minDistFromDeckCenter: number,
  decorKey: DecorKey,
): { x: number; z: number } | null {
  const large = isLargeIslandCanopyDecor(decorKey);
  const lo = 0.22;
  /** World polar radius cap; footprint ellipse removes rim floats — no need to starve placement here. */
  const hi = Math.max(
    lo + 0.18,
    Math.min(
      slot.halfWidthWorld * (large ? 0.72 : 0.8),
      TILE_SIZE * 1.9,
    ),
  );
  if (hi <= lo + 0.12) return null;

  const needSq = minDistFromDeckCenter * minDistFromDeckCenter;
  for (let a = 0; a < maxAttempts; a++) {
    const ang = rng() * Math.PI * 2;
    const frac = Math.pow(rng(), large ? 1.38 : 1.22);
    const rad = lo + (hi - lo) * frac;
    const x = slot.x + Math.cos(ang) * rad;
    const z = slot.z + Math.sin(ang) * rad;
    if (
      minDistSqToTiles(x, z, level) >= needSq &&
      xzInsideUndermapSlotFootprint(slot, x, z)
    ) {
      return { x, z };
    }
  }
  return null;
}

/** Ground Y when no undermap slot is near — well below the course void shelf. */
function voidShelfGroundY(rng: () => number): number {
  return -2.38 - rng() * 1.05;
}

/**
 * Island top Y only when XZ lies on the pad footprint — breaks the loop between “tight reach → no décor”
 * and “loose reach → props floating with no mesh”.
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
    if (!xzInsideUndermapSlotFootprint(s, x, z)) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bestD) {
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
  decorKey: DecorKey,
): { x: number; z: number } | null {
  const b = level.bounds;
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;
  const padMul = isLargeIslandCanopyDecor(decorKey) ? 0.48 : 0.52;
  const pad = Math.max(18, spanX, spanZ) * padMul;
  for (let a = 0; a < maxAttempts; a++) {
    const x = b.minX - pad + rng() * (spanX + pad * 2);
    const z = b.minZ - pad + rng() * (spanZ + pad * 2);
    if (isOutsidePlayableRoute(x, z, level)) return { x, z };
  }
  return null;
}

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
  /** Props only on slot meshes — no void-ring fallback; rim-sampled with deck clearance. */
  islandsOnly: boolean,
): THREE.Object3D | null {
  if (!assetRegistry.isReady(key)) return null;

  const rPre = approximateClearanceRadius(key, targetHeight);
  const hasSlots = slots.length > 0;
  const singleSampleIsland = (): { x: number; z: number; groundY: number } | null => {
    if (hasSlots && preferIsland) {
      const slot = slots[Math.floor(rng() * slots.length)]!;
      const xz = islandsOnly
        ? trySampleIslandRimClearOfDecks(
            slot,
            level,
            rng,
            isLargeIslandCanopyDecor(key) ? 840 : 620,
            effectiveIslandsOnlyDeckClearance(key, rPre, slot),
            key,
          )
        : trySampleNearIsland(slot, level, rng, 170);
      if (xz) {
        const gy = islandsOnly
          ? resolveDecorGroundY(
              xz.x,
              xz.z,
              slots,
              slot.topY + ISLAND_SURFACE_BIAS_Y,
            )
          : resolveDecorGroundY(xz.x, xz.z, slots, slot.topY + ISLAND_SURFACE_BIAS_Y);
        return { ...xz, groundY: gy };
      }
    }
    if (!islandsOnly) {
      const xzOff = trySampleOffDeck(level, rng, 160, key);
      if (xzOff) {
        const gy = resolveDecorGroundY(xzOff.x, xzOff.z, slots, shelfGroundY);
        return { ...xzOff, groundY: gy };
      }
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

    if (islandsOnly) {
      const anchor = nearestSlotToXZ(slots, sample.x, sample.z);
      const needDist = anchor
        ? effectiveIslandsOnlyDeckClearance(key, rPost, anchor)
        : islandsOnlyMinDistFromDecks(key, rPost);
      if (!isFarEnoughFromAllTileDecks(sample.x, sample.z, level, needDist)) {
        disposeDecorClone(node);
        continue;
      }
    }

    placed.push({ x: sample.x, z: sample.z, r: rPost });
    applyShadowMode(node, shadow);
    return node;
  }

  return null;
}

export interface IslandDecorScatterOptions {
  /**
   * Only place props on the given undermap slot tops — no “outside fairway” sampling and no void-ring
   * fallback (procgen-debug islands sit under tiles, so route clearance would reject every sample).
   */
  islandsOnly?: boolean;
}

/**
 * Scatter fantasy props around under-island masses and in a wide ring off the tile deck.
 * Never parents into the course group — visual-only, no gameplay coupling.
 */
export function createIslandSurroundDecor(
  level: GeneratedLevel,
  slots: readonly UndermapIslandSlot[],
  options?: IslandDecorScatterOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "IslandSurroundDecor";

  const anyReady = ISLAND_DECOR_ASSET_KEYS.some((k) => assetRegistry.isReady(k));
  if (!anyReady) return group;

  const islandsOnly = Boolean(options?.islandsOnly);

  const seedStr = `${level.procgenSeed ?? level.id}|${level.levelIndex}|decorScatter`;
  const rng = mulberry32(hashString(seedStr));

  const b = level.bounds;
  const span = Math.max(
    24,
    b.maxX - b.minX,
    b.maxZ - b.minZ,
  );
  let density = Math.max(0.55, Math.min(1.25, span / 40));
  if (islandsOnly && slots.length > 0) {
    density *= Math.max(0.32, Math.min(1.05, slots.length / 5));
  }

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
  const placeAttempts = 520;

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
      islandsOnly,
    );
    if (node) group.add(node);
  }

  return group;
}
