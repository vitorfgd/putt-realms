import * as THREE from "three";
import { cloudVoid, skyBlueTransparent } from "../art/Materials";
import type { LevelWorldBounds } from "./LevelTypes";

export class FantasyVoidLayer extends THREE.Group {
  private readonly water: THREE.Mesh;
  private readonly cloudRing = new THREE.Group();
  private time = 0;

  constructor(bounds: LevelWorldBounds) {
    super();
    this.name = "FantasyVoidLayer";
    const spanX = Math.max(140, bounds.maxX - bounds.minX + 120);
    const spanZ = Math.max(160, bounds.maxZ - bounds.minZ + 140);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(spanX * 2.4, spanZ * 2.4, 12, 12),
      skyBlueTransparent(0.36),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(cx, -7.5, cz);
    this.water.renderOrder = -10;
    this.add(this.water);

    this.cloudRing.name = "VoidCloudRing";
    const cloudMat = cloudVoid();
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        cloudMat,
      );
      const a = (i / 26) * Math.PI * 2;
      const rx = spanX * (0.58 + Math.random() * 0.46);
      const rz = spanZ * (0.52 + Math.random() * 0.42);
      mesh.position.set(cx + Math.cos(a) * rx, -10 - Math.random() * 18, cz + Math.sin(a) * rz);
      const s = 8 + Math.random() * 18;
      mesh.scale.set(s * (1.2 + Math.random()), s * 0.42, s);
      this.cloudRing.add(mesh);
    }
    this.add(this.cloudRing);
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    const mat = this.water.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.32 + Math.sin(this.time * 0.55) * 0.05;
    this.water.position.y = -7.5 + Math.sin(this.time * 0.34) * 0.35;
    this.cloudRing.rotation.y += deltaSeconds * 0.018;
  }
}
