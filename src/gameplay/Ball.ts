import * as THREE from "three";
import { createDefaultBallMaterial } from "../art/Materials";
import type { BallCosmeticId } from "../cosmetics/cosmeticTypes";
import { BALL_RADIUS } from "../core/Constants";

function disposeLoadedSubtree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else (mat as THREE.Material | undefined)?.dispose();
    }
  });
}

/**
 * Sphere mesh + `golf_ball.png` albedo (see Materials.ts).
 */
export class Ball extends THREE.Group {
  static readonly RADIUS = BALL_RADIUS;

  private static readonly _rollAxis = new THREE.Vector3();

  readonly visualRoot = new THREE.Group();
  private primaryMesh: THREE.Mesh | null = null;

  constructor() {
    super();
    this.add(this.visualRoot);
    this.rebuildVisual();
  }

  syncVisualFromRegistry(_cosmetic: BallCosmeticId): void {
    this.rebuildVisual();
  }

  private rebuildVisual(): void {
    while (this.visualRoot.children.length) {
      const ch = this.visualRoot.children[0];
      this.visualRoot.remove(ch);
      disposeLoadedSubtree(ch);
    }
    this.primaryMesh = null;

    const geo = new THREE.SphereGeometry(Ball.RADIUS, 48, 40);
    const mesh = new THREE.Mesh(geo, createDefaultBallMaterial().clone());
    mesh.position.y = Ball.RADIUS;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    this.visualRoot.add(mesh);
    this.primaryMesh = mesh;
  }

  setSinkProgress(t: number): void {
    const k = Math.min(1, Math.max(0, t));
    const s = 1 - k * 0.94;
    this.visualRoot.scale.setScalar(s);
    this.visualRoot.position.y = Ball.RADIUS * (1 - k * 1.15);
  }

  resetVisual(): void {
    this.visualRoot.scale.setScalar(1);
    this.visualRoot.position.y = 0;
    this.visualRoot.quaternion.identity();
    if (this.primaryMesh) {
      this.primaryMesh.quaternion.identity();
    }
  }

  /**
   * Rolling-without-slip around the sphere center: ω = (vz/R, 0, -vx/R).
   * Applied on `primaryMesh` (pivot at ball center), not `visualRoot` (pivot at ground) — that mismatch caused visible “bouncing”.
   */
  applyPlanarRoll(vx: number, vz: number, dt: number, radius: number): void {
    if (!this.primaryMesh) return;
    const speed = Math.hypot(vx, vz);
    if (speed < 1e-5 || dt <= 0 || radius < 1e-5) return;
    const inv = 1 / radius;
    Ball._rollAxis.set(vz * inv, 0, -vx * inv);
    const angle = speed * inv * dt;
    Ball._rollAxis.normalize();
    this.primaryMesh.rotateOnWorldAxis(Ball._rollAxis, angle);
  }

  /** Multiplies map — blend slightly toward white so tint doesn’t flatten dimples */
  applyCosmeticTint(hex: number): void {
    if (!this.primaryMesh) return;
    const m = this.primaryMesh.material as THREE.MeshBasicMaterial;
    const c = new THREE.Color(hex);
    c.lerp(new THREE.Color(0xffffff), 0.18);
    m.color.copy(c);
  }
}
