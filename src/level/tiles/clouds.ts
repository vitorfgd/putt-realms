import * as THREE from "three";
import { cloudVoid, cloudWhite } from "../../art/Materials";
import type { LevelWorldBounds } from "../LevelTypes";

/**
 * Low-poly white blobs floating **below** the course for depth (sky is clear above).
 */
export function addCourseClouds(
  parent: THREE.Object3D,
  bounds: LevelWorldBounds,
  rng: () => number,
): void {
  const group = new THREE.Group();
  group.name = "CloudField";

  const mat = cloudWhite();
  const geoPool = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(0.85, 0),
    new THREE.BoxGeometry(1.4, 0.55, 1.1),
  ];

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const spanX = Math.max(24, bounds.maxX - bounds.minX + 28);
  const spanZ = Math.max(36, bounds.maxZ - bounds.minZ + 36);

  const count = 11 + Math.floor(rng() * 7);

  for (let i = 0; i < count; i++) {
    const geo = geoPool[Math.floor(rng() * geoPool.length)];
    const mesh = new THREE.Mesh(geo, mat);
    const ox = (rng() - 0.5) * spanX * 1.15;
    const oz = (rng() - 0.5) * spanZ * 1.05 + spanZ * 0.14;
    const oy = -10 - rng() * 16 - (rng() * rng()) * 14;
    mesh.position.set(cx + ox, oy, cz + oz);
    const s = 2.2 + rng() * 5.5;
    mesh.scale.setScalar(s * (0.55 + rng()));
    mesh.rotation.set(rng() * 6.2, rng() * 6.2, rng() * 6.2);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  parent.add(group);
}

/**
 * Large bright cloud “sea” under the floating island — reads as endless soft void.
 */
export function addCloudVoidPlane(
  parent: THREE.Object3D,
  bounds: LevelWorldBounds,
): void {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const spanX = Math.max(140, bounds.maxX - bounds.minX + 90);
  const spanZ = Math.max(160, bounds.maxZ - bounds.minZ + 110);

  const geo = new THREE.PlaneGeometry(spanX, spanZ);
  const mesh = new THREE.Mesh(geo, cloudVoid());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, -26, cz);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.name = "CloudVoidPlane";
  parent.add(mesh);
}
