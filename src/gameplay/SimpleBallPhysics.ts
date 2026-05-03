import * as THREE from "three";
import type { LevelWorldBounds, RailCapsule } from "../level/LevelTypes";
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

/** Legacy alias — playable xz clamp from level generator */
export type BallPhysicsBounds = LevelWorldBounds;

export interface PhysicsStepResult {
  /** Ball fell into the void or past recoverable height */
  oob?: boolean;
}

/** Optional environmental forces / surface feel for a single integration step. */
export interface PhysicsStepEnvironment {
  /** ≥1 — scales friction decay (higher = stronger slowdown). */
  frictionScale?: number;
  planarAccelX?: number;
  planarAccelZ?: number;
}

/**
 * Planar roll with friction on the deck, lobbed shots with gravity,
 * and falling past deck edges (no rubber band at forward/lateral cliffs).
 */
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
  /** Set during {@link step} when rails or course bounds deflect the ball — read with {@link consumeSurfaceContact}. */
  private surfaceContact = false;

  constructor(
    readonly radius: number,
    private bounds: LevelWorldBounds,
    /** World z beyond which there is no deck support (forward runway end). */
    private oobMaxZ: number,
  ) {}

  setBounds(next: LevelWorldBounds, oobZ: number): void {
    this.bounds = next;
    this.oobMaxZ = oobZ;
  }

  setRailColliders(next: readonly RailCapsule[]): void {
    this.rails = next;
  }

  /** True once per step if wood rails or outer bounds reflected the ball; then clears. */
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
    if (this.settled) {
      this.surfaceContact = false;
      return {};
    }

    this.surfaceContact = false;
    const dt = deltaSeconds;
    this.velocity.y -= GRAVITY * dt;

    const frictionScale = Math.max(1, env?.frictionScale ?? 1);
    const ax = env?.planarAccelX ?? 0;
    const az = env?.planarAccelZ ?? 0;
    this.velocity.x += ax * dt;
    this.velocity.z += az * dt;

    position.x += this.velocity.x * dt;
    position.z += this.velocity.z * dt;
    position.y += this.velocity.y * dt;

    const { minX, maxX, minZ } = this.bounds;
    const onDeckXZ =
      position.x >= minX &&
      position.x <= maxX &&
      position.z >= minZ &&
      position.z <= this.oobMaxZ;

    if (
      onDeckXZ &&
      position.y <= 0.14 &&
      this.rails.length > 0
    ) {
      this.resolveWoodRails(position);
    }

    if (onDeckXZ && position.y < 0) {
      position.y = 0;
      if (this.velocity.y < 0) {
        this.velocity.y *= -GROUND_RESTITUTION_Y;
      }
      if (Math.abs(this.velocity.y) < 0.48) {
        this.velocity.y = 0;
      }
    }

    /** Damp micro-vertical jitter once the ball is rolling on the deck */
    if (
      onDeckXZ &&
      position.y > 0 &&
      position.y < 0.028 &&
      Math.abs(this.velocity.y) < 0.06
    ) {
      position.y = 0;
      this.velocity.y = 0;
    }

    const grounded =
      onDeckXZ &&
      position.y <= 0.002 &&
      Math.abs(this.velocity.y) < 0.008;

    if (grounded) {
      position.y = 0;
      this.velocity.y = 0;

      if (position.x < minX) {
        position.x = minX;
        this.velocity.x *= -WALL_RESTITUTION;
        this.surfaceContact = true;
      } else if (position.x > maxX) {
        position.x = maxX;
        this.velocity.x *= -WALL_RESTITUTION;
        this.surfaceContact = true;
      }

      if (position.z < minZ) {
        position.z = minZ;
        this.velocity.z *= -WALL_RESTITUTION;
        this.surfaceContact = true;
      }

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

  /** Cream wood rails — push ball out + damp bounce along normal (matches TileKit thickness). */
  private resolveWoodRails(position: THREE.Vector3): void {
    const pad = RAIL_THICKNESS * 0.5 + this.radius * 0.94;

    for (let pass = 0; pass < 4; pass++) {
      for (const seg of this.rails) {
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
