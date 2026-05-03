import * as THREE from "three";
import { aimStripe } from "../art/Materials";

/**
 * Shot preview: line from the ball along shot direction; length follows pull (power).
 */
export class AimIndicator extends THREE.Group {
  private readonly line: THREE.Mesh;
  private readonly maxPullWorld: number;

  constructor(maxPullWorld: number) {
    super();
    this.maxPullWorld = maxPullWorld;
    this.frustumCulled = false;

    const geo = new THREE.BoxGeometry(1, 0.045, 0.055);
    const mat = aimStripe();
    this.line = new THREE.Mesh(geo, mat);
    this.line.castShadow = false;
    this.line.receiveShadow = false;
    this.add(this.line);

    this.visible = false;
  }

  /** Shot goes along `shotDirXZ` (world xz); pull length drives visible length (clamped). */
  show(shotDirXZ: THREE.Vector2, pullLengthWorld: number): void {
    const len = Math.max(0.001, Math.min(pullLengthWorld, this.maxPullWorld));
    const dir = new THREE.Vector3(shotDirXZ.x, 0, shotDirXZ.y).normalize();

    this.line.scale.set(len, 1, 1);
    this.line.position.copy(dir.clone().multiplyScalar(len * 0.5));
    const basis = new THREE.Vector3(1, 0, 0);
    this.line.quaternion.setFromUnitVectors(basis, dir);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}
