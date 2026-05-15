import * as THREE from "three";
import type { LevelWorldBounds } from "../level/LevelTypes";

/**
 * Fit directional shadow ortho to course bounds and assign cast/receive on course meshes.
 * Extracted from {@link Game} to shrink the orchestrator surface.
 */
export function configureCourseShadows(
  courseGroup: THREE.Group,
  keyLight: THREE.DirectionalLight,
  bounds: LevelWorldBounds,
): void {
  const pad = 18;
  const halfW = (bounds.maxX - bounds.minX) / 2 + pad;
  const halfH = (bounds.maxZ - bounds.minZ) / 2 + pad;
  const ext = Math.max(28, halfW, halfH);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const oc = keyLight.shadow.camera as THREE.OrthographicCamera;
  oc.left = -ext;
  oc.right = ext;
  oc.top = ext;
  oc.bottom = -ext;
  oc.updateProjectionMatrix();
  keyLight.target.position.set(cx, 0, cz);
  keyLight.target.updateMatrixWorld();

  courseGroup.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.receiveShadow = true;
    const mat = m.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    const transparent = mats.some(
      (x) => (x as THREE.Material).transparent === true,
    );
    m.castShadow = !transparent;
  });
}
