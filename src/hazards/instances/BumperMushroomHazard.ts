import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { PSX_SKY_BLUE, warmCreamStone } from "../../art/Materials";
import type { SimpleBallPhysics } from "../../gameplay/SimpleBallPhysics";
import type { HazardBallContext } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import {
  HAZARD_SPAN_BUMPER,
  scaleImportedHazardToHorizontalSpan,
} from "../hazardSpatialUtils";

const BUMPER_RADIUS = 1.05;

const BUMPER_HIT_PARTICLE_GEO = new THREE.IcosahedronGeometry(0.062, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);

function bumperSparkMaterial(
  color: number,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
}

interface BumperHitParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class BumperMushroomHazard extends BaseHazard {
  readonly hazardType = "bumper_mushroom";
  private readonly ox: number;
  private readonly oz: number;
  private readonly visualRoot = new THREE.Group();
  private readonly baseScale: number;
  private readonly hitRadius: number;
  private bumpVisualTimer = 0;
  private readonly bumperParticles: BumperHitParticle[] = [];
  private readonly scratchOutward = new THREE.Vector3();

  private static readonly BUMP_VISUAL_DURATION = 0.11;
  private static readonly SPARK_COLORS = [
    0x7affff, 0xfff44d, 0xffffff, 0xff8cf0,
  ] as const;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
    deckY = 0,
    visualScaleMul = 1,
  ) {
    super(id, weight, tileKey);
    this.ox = cx;
    this.oz = cz;
    const m = Math.min(2.75, Math.max(1, visualScaleMul));
    this.baseScale = m;
    this.hitRadius = BUMPER_RADIUS * m;

    this.visualRoot.name = "bumperMushroomVisual";
    this.group.add(this.visualRoot);

    const mush =
      assetRegistry.getModelClone("hazard_bumper_mushroom") ??
      assetRegistry.getModelClone("decor_small_mushroom");
    if (mush) {
      scaleImportedHazardToHorizontalSpan(mush, HAZARD_SPAN_BUMPER);
      this.visualRoot.add(mush);
    } else {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
        new THREE.MeshStandardMaterial({ color: PSX_SKY_BLUE }),
      );
      cap.position.y = 0.38;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, 0.42, 10),
        warmCreamStone(),
      );
      stem.position.y = 0.14;
      this.visualRoot.add(stem, cap);
    }

    this.visualRoot.scale.setScalar(this.baseScale);

    this.group.position.set(cx, deckY, cz);
    this.group.rotation.y = rotationY;
  }

  update(dt: number): void {
    super.update(dt);

    if (this.bumpVisualTimer > 0) {
      this.bumpVisualTimer -= dt;
      const u = Math.max(
        0,
        this.bumpVisualTimer / BumperMushroomHazard.BUMP_VISUAL_DURATION,
      );
      const pulse = Math.sin(u * Math.PI);
      const stretch = pulse * 0.14;
      const b = this.baseScale;
      this.visualRoot.scale.set(
        b * (1 + stretch * 1.12),
        b * (1 - stretch * 0.22),
        b * (1 + stretch * 1.12),
      );
    } else {
      this.visualRoot.scale.setScalar(this.baseScale);
    }

    for (let i = this.bumperParticles.length - 1; i >= 0; i--) {
      const p = this.bumperParticles[i]!;
      p.life -= dt;
      p.velocity.y -= 6.2 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 6.2;
      p.mesh.rotation.z += dt * 5.4;
      const u = Math.max(0, p.life / p.maxLife);
      p.mesh.scale.setScalar(0.42 + u * 0.95);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = u * 0.94;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.bumperParticles.splice(i, 1);
      }
    }
  }

  private spawnBumperHitParticles(worldNx: number, worldNz: number): void {
    const capY = 0.38 * this.baseScale;
    const count = 16;
    this.scratchOutward
      .set(worldNx, 0, worldNz)
      .applyAxisAngle(_AXIS_Y, -this.group.rotation.y);

    const ox = this.scratchOutward.x;
    const oz = this.scratchOutward.z;
    const oLen = Math.hypot(ox, oz) || 1;
    const lx = ox / oLen;
    const lz = oz / oLen;

    for (let i = 0; i < count; i++) {
      const spread = 1.25;
      const burst = 2.4 + Math.random() * 3.2;
      const vx = lx * burst + (Math.random() - 0.5) * spread;
      const vz = lz * burst + (Math.random() - 0.5) * spread;
      const vy = 1.15 + Math.random() * 2.55;
      const c =
        BumperMushroomHazard.SPARK_COLORS[
          i % BumperMushroomHazard.SPARK_COLORS.length
        ]!;
      const mat = bumperSparkMaterial(c, 0.94);
      const mesh = new THREE.Mesh(BUMPER_HIT_PARTICLE_GEO, mat);
      mesh.renderOrder = 4;
      mesh.position.set(
        (Math.random() - 0.5) * 0.12,
        capY + Math.random() * 0.14,
        (Math.random() - 0.5) * 0.12,
      );
      mesh.scale.setScalar(0.55 + Math.random() * 0.75);
      this.group.add(mesh);
      const life = 0.38 + Math.random() * 0.28;
      this.bumperParticles.push({
        mesh,
        velocity: new THREE.Vector3(vx, vy, vz),
        life,
        maxLife: life,
      });
    }
  }

  dispose(): void {
    for (const p of this.bumperParticles) {
      this.group.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.bumperParticles.length = 0;
    super.dispose();
  }

  resolveImpulses(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
    _dt: number,
  ): boolean {
    void _dt;
    const dx = ctx.position.x - this.ox;
    const dz = ctx.position.z - this.oz;
    const dist = Math.hypot(dx, dz);
    const hitR = this.hitRadius + ctx.radius * 0.85;
    if (dist > hitR || dist < 1e-4) return false;
    if (!this.canRegisterHit()) return false;

    const nx = dx / dist;
    const nz = dz / dist;
    const pen = hitR - dist;
    if (pen > 0) {
      ctx.position.x += nx * pen;
      ctx.position.z += nz * pen;
    }

    const vx = physics.velocity.x;
    const vz = physics.velocity.z;
    const vn = vx * nx + vz * nz;
    const rest = 1.22;
    physics.velocity.x -= (1 + rest) * vn * nx;
    physics.velocity.z -= (1 + rest) * vn * nz;
    const bump = 7.85;
    physics.velocity.x += nx * bump;
    physics.velocity.z += nz * bump;

    this.bumpVisualTimer = BumperMushroomHazard.BUMP_VISUAL_DURATION;
    this.spawnBumperHitParticles(nx, nz);

    this.markHit(0.14);
    return true;
  }
}
