import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { warmCreamStone } from "../../art/Materials";
import { BALL_RADIUS } from "../../core/Constants";
import type { SimpleBallPhysics } from "../../gameplay/SimpleBallPhysics";
import { LANE_HALF_WIDTH } from "../../level/TileDimensions";
import type { HazardBallContext } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import { collectSecondMeshAsBladeIfTwoPartGlb } from "../glbTwoPartSpin";
import {
  closestPointOnSegment2D,
  HAZARD_SPAN_WINDMILL,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
} from "../hazardSpatialUtils";
import {
  collectWindmillSpinTargets,
  hideWindmillGreyStaticParts,
} from "../hazardSpinTargets";

const ARM_THICK = 0.28;
/** Visual + collision scale for procedural windmill */
const WINDMILL_SCALE = 0.775;
const WINDMILL_GLB_SPIN_RATE = 5.2;

export class WindmillHazard extends BaseHazard {
  readonly hazardType = "windmill";
  private angle = 0;
  private readonly cx: number;
  private readonly cz: number;
  private armHalfLen!: number;
  private hitExtra!: number;
  private bladeSpinRate: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private armSpins: THREE.Object3D[];
  private windmillSpinAxis: "x" | "y" | "z";
  private useRadialBlocker: boolean;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
    deckY = 0,
  ) {
    super(id, weight, tileKey);
    this.cx = cx;
    this.cz = cz;
    const b = tileBasis(rotationY);
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;

    const glb = assetRegistry.getModelClone("hazard_windmill");
    const armBase = LANE_HALF_WIDTH * 1.12 * WINDMILL_SCALE;
    if (glb) {
      this.group.add(glb);
      scaleImportedHazardToHorizontalSpan(glb, HAZARD_SPAN_WINDMILL);
      const twoPart = collectSecondMeshAsBladeIfTwoPartGlb(glb);
      if (twoPart.length > 0) {
        this.armSpins = twoPart;
        this.windmillSpinAxis = "z";
        this.useRadialBlocker = true;
        this.bladeSpinRate = WINDMILL_GLB_SPIN_RATE;
      } else {
        this.armSpins = collectWindmillSpinTargets(glb);
        this.windmillSpinAxis = "y";
        this.useRadialBlocker = false;
        this.bladeSpinRate = 2.65;
        hideWindmillGreyStaticParts(glb, this.armSpins);
      }
      this.group.position.set(cx, deckY, cz);
      this.group.rotation.y = rotationY;
      this.syncArmCollisionFromMesh();
      if (this.useRadialBlocker) {
        this.armHalfLen = Math.max(this.armHalfLen, LANE_HALF_WIDTH * 0.92);
      }
      return;
    }

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(
        armBase * 2,
        0.14 * WINDMILL_SCALE,
        ARM_THICK * WINDMILL_SCALE,
      ),
      warmCreamStone(),
    );
    arm.position.y = 0.42 * WINDMILL_SCALE;
    arm.name = "windmillArm";
    this.group.add(arm);
    this.armSpins = [arm];
    this.windmillSpinAxis = "y";
    this.useRadialBlocker = false;
    this.bladeSpinRate = 2.65;

    this.group.position.set(cx, deckY, cz);
    this.group.rotation.y = rotationY;
    this.syncArmCollisionFromMesh();
  }

  private syncArmCollisionFromMesh(): void {
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const part of this.armSpins) {
      box.union(new THREE.Box3().setFromObject(part));
    }
    const e = box.getSize(new THREE.Vector3());
    const reach = 0.5 * Math.hypot(e.x, e.z);
    this.armHalfLen = THREE.MathUtils.clamp(
      reach + BALL_RADIUS * 0.02,
      0.7,
      5.0,
    );
    const lateral = Math.min(e.x, e.z);
    this.hitExtra = Math.max(
      ARM_THICK * WINDMILL_SCALE * 0.52,
      lateral * 0.28,
      0.11,
    );
  }

  update(dt: number): void {
    super.update(dt);
    this.angle += this.bladeSpinRate * dt;
    const a = this.angle;
    const ax = this.windmillSpinAxis;
    for (const part of this.armSpins) {
      if (ax === "x") part.rotation.x = a;
      else if (ax === "z") part.rotation.z = a;
      else part.rotation.y = a;
    }
  }

  resolveImpulses(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
    _dt: number,
  ): boolean {
    void _dt;
    if (this.useRadialBlocker) {
      const dx = ctx.position.x - this.cx;
      const dz = ctx.position.z - this.cz;
      const dist = Math.hypot(dx, dz);
      const hitR = ctx.radius + this.armHalfLen + this.hitExtra * 0.65;
      if (dist > hitR) return false;
      if (!this.canRegisterHit()) return false;

      const nx = dist > 1e-5 ? dx / dist : 0;
      const nz = dist > 1e-5 ? dz / dist : 1;
      const pen = hitR - dist;
      if (pen > 0) {
        ctx.position.x += nx * pen;
        ctx.position.z += nz * pen;
      }

      const planarSpeed = Math.hypot(physics.velocity.x, physics.velocity.z);
      const vn = physics.velocity.x * nx + physics.velocity.z * nz;
      const targetOut = Math.max(10, planarSpeed * 0.78 + 4);
      physics.velocity.x += (targetOut - vn) * nx;
      physics.velocity.z += (targetOut - vn) * nz;
      const tx = -nz;
      const tz = nx;
      physics.velocity.x += tx * 2.6;
      physics.velocity.z += tz * 2.6;
      this.markHit();
      return true;
    }

    const vx = Math.cos(this.angle);
    const vz = Math.sin(this.angle);
    const hx = this.armHalfLen * (vx * this.rx + vz * this.fx);
    const hz = this.armHalfLen * (vx * this.rz + vz * this.fz);
    const ax = this.cx - hx;
    const az = this.cz - hz;
    const bx = this.cx + hx;
    const bz = this.cz + hz;

    const { x: qx, z: qz } = closestPointOnSegment2D(
      ctx.position.x,
      ctx.position.z,
      ax,
      az,
      bx,
      bz,
    );
    const dx = ctx.position.x - qx;
    const dz = ctx.position.z - qz;
    const dist = Math.hypot(dx, dz);
    const hitR = ctx.radius + this.hitExtra;
    if (dist > hitR) return false;
    if (!this.canRegisterHit()) return false;

    const sx = bx - ax;
    const sz = bz - az;
    const sl = Math.hypot(sx, sz) || 1;
    let nx = -sz / sl;
    let nz = sx / sl;
    const ox = ctx.position.x - qx;
    const oz = ctx.position.z - qz;
    if (ox * nx + oz * nz < 0) {
      nx *= -1;
      nz *= -1;
    }

    const pen = hitR - dist;
    if (pen > 0) {
      ctx.position.x += nx * pen;
      ctx.position.z += nz * pen;
    }

    const planarSpeed = Math.hypot(physics.velocity.x, physics.velocity.z);
    const vn = physics.velocity.x * nx + physics.velocity.z * nz;
    const targetOut = Math.max(12, planarSpeed * 0.82 + 5);
    physics.velocity.x += (targetOut - vn) * nx;
    physics.velocity.z += (targetOut - vn) * nz;
    const tangentX = sx / sl;
    const tangentZ = sz / sl;
    const spinKick = 3.2;
    physics.velocity.x += tangentX * spinKick;
    physics.velocity.z += tangentZ * spinKick;
    this.markHit();
    return true;
  }
}
