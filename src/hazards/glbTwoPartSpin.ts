import * as THREE from "three";

/**
 * Two-part GLB (fan / windmill): traverse-order first mesh = body, second = blades (only second spins).
 * If fewer than two meshes, returns [] so callers can fall back to name-based discovery.
 */
export function collectSecondMeshAsBladeIfTwoPartGlb(
  root: THREE.Object3D,
): THREE.Object3D[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) meshes.push(m);
  });
  if (meshes.length >= 2) return [meshes[1]!];
  return [];
}

/** Alias for fan hazard — same rule as {@link collectSecondMeshAsBladeIfTwoPartGlb}. */
export function collectFanSpinTargetsFromMeshOrder(
  root: THREE.Object3D,
): THREE.Object3D[] {
  return collectSecondMeshAsBladeIfTwoPartGlb(root);
}
