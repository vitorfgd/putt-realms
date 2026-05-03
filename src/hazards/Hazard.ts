import type * as THREE from "three";
import type { SimpleBallPhysics } from "../gameplay/SimpleBallPhysics";

export interface HazardBallContext {
  position: THREE.Vector3;
  radius: number;
}

export interface HazardEnvironmental {
  /** Multiplier on base friction exponent (≥1 = more grip loss in sand) */
  frictionScale: number;
  /** Planar acceleration in world xz (fan) */
  accelX: number;
  accelZ: number;
}

/**
 * Runtime hazard placed on a course tile. Visuals live under `group`.
 */
export interface HazardInstance {
  readonly id: string;
  readonly hazardType: string;
  readonly tileId: string;
  readonly weight: number;
  readonly group: THREE.Group;

  update(dt: number): void;

  /** Accumulate environmental effects for this frame (sand / fan). */
  accumulateEnvironment(
    ctx: HazardBallContext,
    env: HazardEnvironmental,
  ): void;

  /**
   * Impulses after physics integration — windmill arm, axe blade.
   * @returns true if a hit was registered (feedback).
   */
  resolveImpulses(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
    dt: number,
  ): boolean;

  /**
   * Bridge gaps — true if ball should count as OOB this frame.
   */
  checkBridgeOob?(ctx: HazardBallContext): boolean;

  dispose(): void;
}
