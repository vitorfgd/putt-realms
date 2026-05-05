import * as THREE from "three";
import type {
  CourseSurface,
  LevelWorldBounds,
  RailCapsule,
} from "../level/LevelTypes";
import { sampleCourseSurface } from "../level/courseSurface";
import { RAIL_THICKNESS } from "../level/TileDimensions";
import {
  FALL_OOB_Y,
  GRAVITY,
  GROUND_RESTITUTION_Y,
  PHYS_FRICTION_PER_SEC,
  PHYS_SETTLE_SPEED,
  SHOT_LOB_RATIO,
  WALL_RESTITUTION,
} from "../core/Constants";

/** Legacy alias: playable xz bounds from level generator. */
export type BallPhysicsBounds = LevelWorldBounds;

export interface PhysicsStepResult {
  /** Ball fell into the void or past recoverable height */
  oob?: boolean;
}

/** Optional environmental forces / surface feel for a single integration step. */
export interface PhysicsStepEnvironment {
  /** >=1: scales friction decay (higher = stronger slowdown). */
  frictionScale?: number;
  planarAccelX?: number;
  planarAccelZ?: number;
}

function closestPointOnSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-10 ? (apx * abx + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t };
}

export class SimpleBallPhysics {
  readonly velocity = new THREE.Vector3(0, 0, 0);
  private settled = true;
  private rails: readonly RailCapsule[] = [];
  private surface: CourseSurface | undefined;
  /** Set during step when rails deflect the ball, then read with consumeSurfaceContact. */
  private surfaceContact = false;

  constructor(
    readonly radius: number,
    private bounds: LevelWorldBounds,
    /** Legacy compatibility: kept for callers/debugging; support now comes from CourseSurface. */
    private oobMaxZ: number,
    surface?: CourseSurface,
  ) {
    this.surface = surface;
  }

  setBounds(next: LevelWorldBounds, oobZ: number): void {
    this.bounds = next;
    this.oobMaxZ = oobZ;
    void this.bounds;
  }

  setRailColliders(next: readonly RailCapsule[]): void {
    this.rails = next;
  }

  setSurface(next: CourseSurface): void {
    this.surface = next;
  }

  surfaceHeightAt(x: number, z: number): number | null {
    return sampleCourseSurface(this.surface, x, z)?.y ?? null;
  }

  /** True once per step if wood rails reflected the ball; then clears. */
  consumeSurfaceContact(): boolean {
    const v = this.surfaceContact;
    this.surfaceContact = false;
    return v;
  }

  getOobMaxZ(): number {
    return this.oobMaxZ;
  }

  isSettled(): boolean {
    return this.settled;
  }

  markRolling(): void {
    this.settled = false;
  }

  settleHard(): void {
    this.velocity.set(0, 0, 0);
    this.settled = true;
  }

  applyShot(directionXZ: THREE.Vector2, speed: number): void {
    const dir = directionXZ.clone();
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.y * speed;
    this.velocity.y = SHOT_LOB_RATIO * speed;
    this.settled = false;
  }

  step(
    position: THREE.Vector3,
    deltaSeconds: number,
    env?: PhysicsStepEnvironment,
  ): PhysicsStepResult {
    this.surfaceContact = false;
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const maxStepTravel = Math.max(0.22, this.radius * 0.58);
    const substeps = Math.min(
      12,
      Math.max(1, Math.ceil((planarSpeed * deltaSeconds) / maxStepTravel)),
    );
    let result: PhysicsStepResult = {};
    for (let i = 0; i < substeps; i++) {
      result = this.stepOnce(position, deltaSeconds / substeps, env);
      if (result.oob || this.settled) return result;
    }
    return result;
  }

  private stepOnce(
    position: THREE.Vector3,
    deltaSeconds: number,
    env?: PhysicsStepEnvironment,
  ): PhysicsStepResult {
    if (this.settled) {
      this.surfaceContact = false;
      return {};
    }

    const dt = deltaSeconds;
    this.velocity.y -= GRAVITY * dt;

    const preSupport = sampleCourseSurface(this.surface, position.x, position.z);
    const supportedBefore =
      preSupport !== null && position.y <= preSupport.y + 0.08;
    const rampGravity =
      supportedBefore && preSupport.patch.kind === "ramp" ? 0.58 : 0;
    const frictionScale = Math.max(1, env?.frictionScale ?? 1);
    const ax =
      (env?.planarAccelX ?? 0) - (preSupport?.gradX ?? 0) * GRAVITY * rampGravity;
    const az =
      (env?.planarAccelZ ?? 0) - (preSupport?.gradZ ?? 0) * GRAVITY * rampGravity;
    this.velocity.x += ax * dt;
    this.velocity.z += az * dt;

    position.x += this.velocity.x * dt;
    position.z += this.velocity.z * dt;
    position.y += this.velocity.y * dt;

    let support = sampleCourseSurface(this.surface, position.x, position.z);
    let supportY = support?.y ?? null;
    const railSupportY = supportY ?? (supportedBefore ? preSupport?.y ?? null : null);

    if (
      railSupportY !== null &&
      position.y <= railSupportY + 0.24 &&
      this.rails.length > 0
    ) {
      this.resolveWoodRails(position, railSupportY);
      support = sampleCourseSurface(this.surface, position.x, position.z);
      supportY = support?.y ?? null;
    }

    if (supportY !== null && position.y < supportY) {
      position.y = supportY;
      if (this.velocity.y < 0) {
        this.velocity.y *= -GROUND_RESTITUTION_Y;
      }
      if (Math.abs(this.velocity.y) < 0.48) {
        this.velocity.y = 0;
      }
    }

    if (
      supportY !== null &&
      position.y > supportY &&
      position.y < supportY + 0.028 &&
      Math.abs(this.velocity.y) < 0.06
    ) {
      position.y = supportY;
      this.velocity.y = 0;
    }

    const groundedY = supportY;
    const grounded =
      groundedY !== null &&
      position.y <= groundedY + 0.002 &&
      Math.abs(this.velocity.y) < 0.008;

    if (grounded) {
      position.y = groundedY;
      this.velocity.y = 0;

      const drag = Math.exp(-PHYS_FRICTION_PER_SEC * frictionScale * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;

      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed < PHYS_SETTLE_SPEED) {
        this.velocity.set(0, 0, 0);
        this.settled = true;
      }

      return {};
    }

    if (position.y < FALL_OOB_Y) {
      return { oob: true };
    }

    this.settled = false;
    return {};
  }

  /** Cream wood rails: push ball out + damp bounce along normal (matches TileKit thickness). */
  private resolveWoodRails(position: THREE.Vector3, supportY: number): void {
    const pad = RAIL_THICKNESS * 0.5 + this.radius * 0.94;

    for (let pass = 0; pass < 4; pass++) {
      for (const seg of this.rails) {
        if (
          (seg.yMin !== undefined && supportY < seg.yMin) ||
          (seg.yMax !== undefined && supportY > seg.yMax)
        ) {
          continue;
        }
        const q = closestPointOnSegment2D(
          position.x,
          position.z,
          seg.ax,
          seg.az,
          seg.bx,
          seg.bz,
        );
        const dx = position.x - q.x;
        const dz = position.z - q.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-7 || d >= pad) continue;
        const nx = dx / d;
        const nz = dz / d;
        const pen = pad - d;
        position.x += nx * pen;
        position.z += nz * pen;
        this.surfaceContact = true;
        const vn = this.velocity.x * nx + this.velocity.z * nz;
        if (vn < 0) {
          this.velocity.x -= (1 + WALL_RESTITUTION) * vn * nx;
          this.velocity.z -= (1 + WALL_RESTITUTION) * vn * nz;
        }
      }
    }
  }
}
