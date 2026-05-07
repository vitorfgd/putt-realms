import * as THREE from "three";
import { cloudWhite } from "../art/Materials";
import type { LevelWorldBounds } from "./LevelTypes";

/** Shared smooth puff — only spheres (no boxes) so silhouettes stay billowy */
const PUFF_GEO = new THREE.SphereGeometry(1, 10, 8);

/**
 * One cloud = several overlapping soft spheres with gentle offsets (cheap volumetric read).
 */
function addCloudCluster(
  parent: THREE.Group,
  template: THREE.MeshStandardMaterial,
  rng: () => number,
  ox: number,
  oy: number,
  oz: number,
  scaleMul = 1,
): void {
  const base = (3.5 + rng() * 12) * scaleMul;
  const mat = template.clone();
  mat.color.setHex(0xedf8ff);
  mat.transparent = true;
  /** Lighter, airier — reads more like distant vapor */
  mat.opacity = 0.38 + rng() * 0.16;
  mat.depthWrite = false;
  mat.roughness = 1;
  mat.metalness = 0;

  const cluster = new THREE.Group();
  cluster.position.set(ox, oy, oz);
  cluster.rotation.y = (rng() - 0.5) * 0.85;

  const nPuffs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nPuffs; i++) {
    const mesh = new THREE.Mesh(PUFF_GEO, mat);
    const r = base * (0.32 + rng() * 0.36);
    /** Puffy ellipsoid — keep Y within ~0.55–1.0 of horizontal so nothing reads as a slab */
    const fx = 0.82 + rng() * 0.28;
    const fy = 0.58 + rng() * 0.38;
    const fz = 0.78 + rng() * 0.3;
    mesh.scale.set(r * fx, r * fy, r * fz);
    const spread = base * 0.42;
    mesh.position.set(
      (rng() - 0.5) * spread * 1.1,
      (rng() - 0.5) * spread * 0.55,
      (rng() - 0.5) * spread,
    );
    mesh.rotation.set((rng() - 0.5) * 0.25, (rng() - 0.5) * 0.35, (rng() - 0.5) * 0.25);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    cluster.add(mesh);
  }

  parent.add(cluster);
}

/**
 * Clouds stay below the course plane so the map remains the highest readable layer.
 */
export function createSkyCloudBackdrop(
  bounds: LevelWorldBounds,
  rng: () => number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "SkyCloudBackdrop";

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const spanX = Math.max(100, bounds.maxX - bounds.minX + 95);
  const spanZ = Math.max(120, bounds.maxZ - bounds.minZ + 100);

  const template = cloudWhite();

  const hz = bounds.maxZ - bounds.minZ;

  const nUnder = 34 + Math.floor(rng() * 14);
  for (let i = 0; i < nUnder; i++) {
    const oy = -10 - rng() * 50;
    const ox = (rng() - 0.5) * spanX * 2.4;
    const oz =
      (rng() - 0.5) * spanZ * 2.35 + (hz > 0.5 ? spanZ * 0.18 : 0);
    addCloudCluster(group, template, rng, cx + ox, oy, cz + oz, 0.72);
  }

  const nMid = 18 + Math.floor(rng() * 8);
  for (let i = 0; i < nMid; i++) {
    const oy = -14 - rng() * 20;
    const ox = (rng() - 0.5) * spanX * 2.1;
    const oz =
      (rng() - 0.5) * spanZ * 2 +
      (hz > 0.5 ? spanZ * (0.25 + rng() * 0.35) : 0);
    addCloudCluster(group, template, rng, cx + ox, oy, cz + oz, 0.62);
  }

  const nHigh = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < nHigh; i++) {
    const oy = -18 - rng() * 18;
    const ox = (rng() - 0.5) * spanX * 2.2;
    const oz = (rng() - 0.5) * spanZ * 2.1;
    addCloudCluster(group, template, rng, cx + ox, oy, cz + oz, 0.52);
  }

  return group;
}
