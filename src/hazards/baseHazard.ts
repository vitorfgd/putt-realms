import * as THREE from "three";
import type { SimpleBallPhysics } from "../gameplay/SimpleBallPhysics";
import type {
  HazardBallContext,
  HazardEnvironmental,
  HazardInstance,
} from "./Hazard";

export abstract class BaseHazard implements HazardInstance {
  abstract readonly hazardType: string;
  readonly group = new THREE.Group();
  readonly tileId: string;
  private hitCooldown = 0;

  constructor(
    readonly id: string,
    readonly weight: number,
    tileGridKey: string,
  ) {
    this.tileId = tileGridKey;
  }

  update(_dt: number): void {
    this.hitCooldown = Math.max(0, this.hitCooldown - _dt);
  }

  accumulateEnvironment(
    _ctx: HazardBallContext,
    _env: HazardEnvironmental,
  ): void {
    void _ctx;
    void _env;
  }

  resolveImpulses(
    _ctx: HazardBallContext,
    _physics: SimpleBallPhysics,
    _dt: number,
  ): boolean {
    void _ctx;
    void _physics;
    void _dt;
    return false;
  }

  checkBridgeOob?(_ctx: HazardBallContext): boolean;

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else (m.material as THREE.Material)?.dispose();
      }
    });
  }

  protected canRegisterHit(): boolean {
    return this.hitCooldown <= 0;
  }

  protected markHit(cooldownSeconds = 0.34): void {
    this.hitCooldown = cooldownSeconds;
  }
}
