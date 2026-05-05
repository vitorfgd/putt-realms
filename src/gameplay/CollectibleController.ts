import * as THREE from "three";
import type { CollectibleSpec } from "../level/LevelTypes";
import { createCoinMesh } from "./ShotEffects";

interface LiveCollectible {
  spec: CollectibleSpec;
  group: THREE.Group;
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
    this.clear();
    this.collectedValue = 0;
    this.collectedCount = 0;
    for (const spec of specs) {
      const group = createCoinMesh(spec.value);
      group.name = spec.id;
      group.position.set(spec.x, spec.y, spec.z);
      this.group.add(group);
      this.live.push({ spec: { ...spec, collected: false }, group });
    }
  }

  clear(): void {
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
    this.live.length = 0;
  }

  update(deltaSeconds: number): void {
    for (const item of this.live) {
      if (item.spec.collected) continue;
      item.group.rotation.y += deltaSeconds * 2.8;
      item.group.position.y =
        item.spec.y + Math.sin(performance.now() * 0.004 + item.spec.tileIndex) * 0.08;
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
