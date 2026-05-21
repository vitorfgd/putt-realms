import * as THREE from "three";
import { assetRegistry } from "../art/AssetRegistry";
import type { CollectibleSpec } from "../level/LevelTypes";
import { createCoinMesh } from "./ShotEffects";

interface LiveCollectible {
  spec: CollectibleSpec;
  group: THREE.Group;
}

const COLLECTIBLE_SIZE_MUL = 1.42;
const COLLECTIBLE_FOOTPRINT_R = (value: number) => (0.31 + value * 0.026) * COLLECTIBLE_SIZE_MUL;

/**
 * Slightly warmer / brighter materials so coins read against fairways and shadows.
 */
function boostCoinMaterials(root: THREE.Object3D): void {
  const warm = new THREE.Color(0xffd870);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (
        m instanceof THREE.MeshStandardMaterial ||
        m instanceof THREE.MeshPhysicalMaterial
      ) {
        m.emissive.copy(m.emissive).lerp(warm, 0.42);
        m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.55);
      } else if (m instanceof THREE.MeshLambertMaterial) {
        m.emissive.copy(m.emissive).lerp(warm, 0.35);
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.45);
      }
    }
  });
}

/**
 * In-world coin pickups: {@link AssetRegistry} `coin` GLB when loaded, else {@link createCoinMesh}.
 */
function buildPickupCoinGroup(value: number): THREE.Group {
  const footprintR = COLLECTIBLE_FOOTPRINT_R(value);
  const clone = assetRegistry.getModelClone("coin");
  if (!clone) {
    const g = createCoinMesh(value);
    g.scale.multiplyScalar(COLLECTIBLE_SIZE_MUL);
    boostCoinMaterials(g);
    return g;
  }
  const wrap = new THREE.Group();
  wrap.add(clone);
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-5);
  const targetDiameter = 2 * footprintR;
  const s = targetDiameter / maxDim;
  clone.scale.multiplyScalar(s);
  clone.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(clone);
  clone.position.y -= grounded.min.y;
  boostCoinMaterials(wrap);
  return wrap;
}

export class CollectibleController {
  readonly group = new THREE.Group();
  private readonly live: LiveCollectible[] = [];
  private collectedValue = 0;
  private collectedCount = 0;

  constructor() {
    this.group.name = "Collectibles";
  }

  reset(specs: readonly CollectibleSpec[]): void {
    this.disposeCoinMeshChildren();
    this.live.length = 0;
    this.collectedValue = 0;
    this.collectedCount = 0;
    for (const spec of specs) {
      const group = buildPickupCoinGroup(spec.value);
      group.name = spec.id;
      group.position.set(spec.x, spec.y, spec.z);
      this.group.add(group);
      this.live.push({ spec: { ...spec, collected: false }, group });
    }
  }

  clear(): void {
    this.disposeCoinMeshChildren();
    this.live.length = 0;
  }

  private disposeCoinMeshChildren(): void {
    while (this.group.children.length) {
      const ch = this.group.children[0];
      this.group.remove(ch);
      ch.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material | undefined)?.dispose();
      });
    }
  }

  update(deltaSeconds: number): void {
    const t = performance.now() * 0.001;
    for (const item of this.live) {
      if (item.spec.collected) continue;
      item.group.rotation.y += deltaSeconds * 4.9;
      const pulse = 1 + 0.18 * Math.sin(t * 4.6 + item.spec.tileIndex * 0.73);
      item.group.scale.setScalar(pulse);
      item.group.position.y =
        item.spec.y +
        Math.sin(performance.now() * 0.006 + item.spec.tileIndex) * 0.2;
    }
  }

  collectNear(
    position: THREE.Vector3,
    radius: number,
  ): { value: number; position: THREE.Vector3; id: string }[] {
    const hits: { value: number; position: THREE.Vector3; id: string }[] = [];
    const r2 = radius * radius;
    for (const item of this.live) {
      if (item.spec.collected) continue;
      const dx = item.group.position.x - position.x;
      const dy = item.group.position.y - position.y;
      const dz = item.group.position.z - position.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      item.spec.collected = true;
      item.group.visible = false;
      this.collectedValue += item.spec.value;
      this.collectedCount++;
      hits.push({
        value: item.spec.value,
        position: item.group.position.clone(),
        id: item.spec.id,
      });
    }
    return hits;
  }

  getCollectedValue(): number {
    return this.collectedValue;
  }

  getCollectedCount(): number {
    return this.collectedCount;
  }
}
