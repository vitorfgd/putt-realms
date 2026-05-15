import * as THREE from "three";

/**
 * Imported FBX/GLB hazard meshes are often authored in cm or arbitrary units.
 * Uniform scale so max(X,Z) bbox extent matches target world span (~tile/lane scale).
 */
export function scaleImportedHazardToHorizontalSpan(
  root: THREE.Object3D,
  targetSpanXZ: number,
): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1e-6);
  if (!Number.isFinite(span)) return;
  root.scale.setScalar(targetSpanXZ / span);
}

/** Target horizontal footprint (world units) per hazard after auto-scale */
export const HAZARD_SPAN_WINDMILL = 5.2;
export const HAZARD_SPAN_FAN = 2.5;
export const HAZARD_SPAN_BRIDGE = 6;
export const HAZARD_SPAN_BUMPER = 2.05;
export const HAZARD_SPAN_PORTAL = 2.35;
export const HAZARD_SPAN_BOOST = 4.3;
export const HAZARD_SPAN_SAND = 4.8;

export function tileBasis(rotationY: number): {
  fx: number;
  fz: number;
  rx: number;
  rz: number;
} {
  const fx = Math.sin(rotationY);
  const fz = Math.cos(rotationY);
  const rx = Math.cos(rotationY);
  const rz = -Math.sin(rotationY);
  return { fx, fz, rx, rz };
}

export function worldToLocalXZ(
  px: number,
  pz: number,
  ox: number,
  oz: number,
  rx: number,
  rz: number,
  fx: number,
  fz: number,
): { lx: number; lz: number } {
  const dx = px - ox;
  const dz = pz - oz;
  return {
    lx: dx * rx + dz * rz,
    lz: dx * fx + dz * fz,
  };
}

export function closestPointOnSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t, t };
}
