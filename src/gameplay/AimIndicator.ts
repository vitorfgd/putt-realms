import * as THREE from "three";
import {
  BALL_RADIUS,
  GRAVITY,
  SHOT_LOB_RATIO,
  shotSpeedFromPower01,
} from "../core/Constants";

/** Matches {@link Game} — aim group sits slightly above the ball center. */
const AIM_GROUP_Y = 0.08;

/**
 * Shot preview: ballistic arc from the ball matching {@link SimpleBallPhysics.applyShot}
 * (planar speed + lob, constant gravity), until the first ground crossing.
 */
export class AimIndicator extends THREE.Group {
  private readonly line: THREE.Line;
  private readonly maxPullWorld: number;

  constructor(maxPullWorld: number) {
    super();
    this.maxPullWorld = maxPullWorld;
    this.frustumCulled = false;

    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: 0xfff3c8,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: true,
    });
    this.line = new THREE.Line(geo, mat);
    this.line.frustumCulled = false;
    this.line.castShadow = false;
    this.line.receiveShadow = false;
    this.add(this.line);

    this.visible = false;
  }

  /**
   * `shotDirXZ` is world XZ (Vector2.x → world X, .y → world Z).
   * `power01` drives the same speed curve as the real shot.
   */
  show(
    shotDirXZ: THREE.Vector2,
    pullLengthWorld: number,
    power01: number,
  ): void {
    const pull = Math.max(0, Math.min(pullLengthWorld, this.maxPullWorld));
    if (pull < 0.02) {
      this.visible = false;
      return;
    }

    const dir = shotDirXZ.clone();
    if (dir.lengthSq() < 1e-10) dir.set(1, 0);
    dir.normalize();

    const speed = shotSpeedFromPower01(power01);
    const vx = dir.x * speed;
    const vz = dir.y * speed;
    const vy = SHOT_LOB_RATIO * speed;

    /** Shot origin in this group's space — ball center (parent has +AIM_GROUP_Y). */
    const ox = 0;
    const oy = -AIM_GROUP_Y;
    const oz = 0;
    /** First landing: ball center reaches deck height under the aim origin. */
    const yLand = -AIM_GROUP_Y - BALL_RADIUS + 0.015;

    const pts: THREE.Vector3[] = [];
    const dt = 0.028;
    const maxT = 2.75;
    const maxPts = 100;
    for (let i = 0, t = 0; t <= maxT && pts.length < maxPts; i++, t = i * dt) {
      const x = ox + vx * t;
      const y = oy + vy * t - 0.5 * GRAVITY * t * t;
      const z = oz + vz * t;
      pts.push(new THREE.Vector3(x, y, z));
      if (t > 1e-4 && y <= yLand) break;
    }

    if (pts.length < 2) {
      pts.length = 0;
      pts.push(
        new THREE.Vector3(ox, oy, oz),
        new THREE.Vector3(ox + vx * 0.04, oy + vy * 0.04, oz + vz * 0.04),
      );
    }

    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}
