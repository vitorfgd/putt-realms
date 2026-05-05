import * as THREE from "three";
import { assetRegistry } from "../art/AssetRegistry";
import {
  bladeSteel,
  boostPadArrowBlue,
  fanStone,
  hazardBridgeGapRed,
  PSX_SKY_BLUE,
  sandGold,
  warmCreamStone,
  woodBrown,
} from "../art/Materials";
import { BALL_RADIUS } from "../core/Constants";
import type { SimpleBallPhysics } from "../gameplay/SimpleBallPhysics";
import type { HazardSpawnSpec } from "../level/LevelTypes";
import {
  LANE_HALF_WIDTH,
  LANE_WIDTH,
  TILE_SIZE,
} from "../level/TileDimensions";
import type { HazardBallContext, HazardEnvironmental, HazardInstance } from "./Hazard";

const ARM_THICK = 0.28;
/** Visual + collision scale for procedural windmill (GLB gets its own scale) */
const WINDMILL_SCALE = 0.775;
const WINDMILL_GLB_SCALE = 0.825;
const AXE_SCALE = 1.5;
const AXE_GLB_SCALE = 1.6;

function tileBasis(rotationY: number): {
  fx: number;
  fz: number;
  rx: number;
  rz: number;
} {
  /** Forward +Z local → world */
  const fx = Math.sin(rotationY);
  const fz = Math.cos(rotationY);
  const rx = Math.cos(rotationY);
  const rz = -Math.sin(rotationY);
  return { fx, fz, rx, rz };
}

function worldToLocalXZ(
  px: number,
  pz: number,
  ox: number,
  oz: number,
  rx: number,
  rz: number,
  fx: number,
  fz: number,
): { lx: number; lz: number } {
  const dx = px - ox;
  const dz = pz - oz;
  return {
    lx: dx * rx + dz * rz,
    lz: dx * fx + dz * fz,
  };
}

function closestPointOnSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t, t };
}

/** GLB windmills often add a grey pole/mast; hide by name so only the big wood arm reads */
function hideWindmillGreyStaticParts(root: THREE.Object3D, armSpin: THREE.Object3D): void {
  const re =
    /pole|mast|tower|column|stem|post|stand|pylon|pedestal|mount|shaft|hub|bearing/i;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o === armSpin) return;
    let p: THREE.Object3D | null = o.parent;
    while (p) {
      if (p === armSpin) return;
      p = p.parent;
    }
    if (re.test(o.name)) o.visible = false;
  });
}

abstract class BaseHazard implements HazardInstance {
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
        else (mat as THREE.Material)?.dispose();
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

class WindmillHazard extends BaseHazard {
  readonly hazardType = "windmill";
  private angle = 0;
  private readonly cx: number;
  private readonly cz: number;
  /** World-space half blade reach in XZ (center → tip), from mesh bounds */
  private armHalfLen!: number;
  /** Added to {@link HazardBallContext.radius} for hit test — matches blade width in XZ */
  private hitExtra!: number;
  /** Always positive — one-way spin */
  private readonly spin = 2.65;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  /** Spin target — procedural arm mesh or GLB node `windmillArm` */
  private readonly armSpin: THREE.Object3D;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
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
      this.armSpin =
        glb.getObjectByName("windmillArm") ?? glb;
      hideWindmillGreyStaticParts(glb, this.armSpin);
      this.group.scale.setScalar(WINDMILL_GLB_SCALE);
      this.group.position.set(cx, 0, cz);
      this.group.rotation.y = rotationY;
      this.syncArmCollisionFromMesh();
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
    this.armSpin = arm;

    this.group.position.set(cx, 0, cz);
    this.group.rotation.y = rotationY;
    this.syncArmCollisionFromMesh();
  }

  /** Align segment length + hit thickness with the actual scaled mesh (fixes GLB vs math mismatch). */
  private syncArmCollisionFromMesh(): void {
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.armSpin);
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
    this.angle += this.spin * dt;
    /** Monotonic Y — same spin sense forever (no sin back-and-forth) */
    this.armSpin.rotation.y = this.angle;
  }

  resolveImpulses(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
    _dt: number,
  ): boolean {
    void _dt;
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

    /** Segment direction */
    const sx = bx - ax;
    const sz = bz - az;
    const sl = Math.hypot(sx, sz) || 1;
    /** Normal (push ball out) */
    let nx = -sz / sl;
    let nz = sx / sl;
    /** Push from closest point outward */
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

class SandpitHazard extends BaseHazard {
  readonly hazardType = "sandpit";
  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly halfW: number;
  private readonly halfL: number;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = cx;
    this.oz = cz;
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.halfW = LANE_HALF_WIDTH * 0.78;
    this.halfL = TILE_SIZE * 0.38;

    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(this.halfW * 2, 0.08, this.halfL * 2),
      sandGold(),
    );
    sand.position.y = -0.09;
    sand.rotation.y = rotationY;
    this.group.add(sand);
    this.group.position.set(cx, 0, cz);
  }

  accumulateEnvironment(
    ctx: HazardBallContext,
    env: HazardEnvironmental,
  ): void {
    const loc = worldToLocalXZ(
      ctx.position.x,
      ctx.position.z,
      this.ox,
      this.oz,
      this.rx,
      this.rz,
      this.fx,
      this.fz,
    );
    if (
      Math.abs(loc.lx) <= this.halfW + ctx.radius * 0.4 &&
      Math.abs(loc.lz) <= this.halfL + ctx.radius * 0.4
    ) {
      env.frictionScale = Math.max(env.frictionScale, 4.2);
    }
  }
}

class FanHazard extends BaseHazard {
  readonly hazardType = "fan";
  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly pushX: number;
  private readonly pushZ: number;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
    fanSign: 1 | -1,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = cx;
    this.oz = cz;
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.pushX = b.rx * fanSign * 9;
    this.pushZ = b.rz * fanSign * 9;

    const fanGlb = assetRegistry.getModelClone("hazard_fan");
    if (fanGlb) {
      this.group.add(fanGlb);
      this.group.position.set(cx, 0, cz);
      return;
    }

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.42, 0.22, 10),
      fanStone(),
    );
    body.rotation.z = Math.PI / 2;
    body.position.set(-b.rx * 0.9, 0.25, -b.rz * 0.9);
    this.group.add(body);

    const mat = new THREE.MeshBasicMaterial({
      color: PSX_SKY_BLUE,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const ribbon = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6 - i * 0.22, 0.07),
        mat,
      );
      ribbon.rotation.x = -Math.PI / 2;
      ribbon.position.set(b.fx * (1.2 + i * 0.55), 0.04, b.fz * (1.2 + i * 0.55));
      ribbon.rotation.y = rotationY;
      this.group.add(ribbon);
    }

    this.group.position.set(cx, 0, cz);
  }

  accumulateEnvironment(
    ctx: HazardBallContext,
    env: HazardEnvironmental,
  ): void {
    const loc = worldToLocalXZ(
      ctx.position.x,
      ctx.position.z,
      this.ox,
      this.oz,
      this.rx,
      this.rz,
      this.fx,
      this.fz,
    );
    const ahead = loc.lz;
    const side = loc.lx;
    if (
      ahead > 0.3 &&
      ahead < TILE_SIZE * 0.55 &&
      Math.abs(side) < LANE_HALF_WIDTH * 0.95
    ) {
      const k = 0.055;
      env.accelX += this.pushX * k;
      env.accelZ += this.pushZ * k;
    }
  }
}

class BridgeHazard extends BaseHazard {
  readonly hazardType = "bridge";
  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly narrow: number;

  /**
   * Full hazard ring around the bridge deck: lateral strips + front/back caps
   * (matches {@link checkBridgeOob} tile footprint, outside the narrow safe deck).
   */
  private addBridgeHazardSurround(rotationY: number): void {
    const mat = hazardBridgeGapRed(0.58);
    const laneX = LANE_HALF_WIDTH * 1.02;
    const n = this.narrow;
    const halfLenZ = TILE_SIZE * 0.46;
    const capZ = 0.62;
    const y = 0.035;
    const h = 0.12;

    const wSide = laneX - n;
    const cxSide = -(laneX + n) * 0.5;

    const mk = (geo: THREE.BoxGeometry, px: number, pz: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, y, pz);
      m.rotation.y = rotationY;
      m.renderOrder = 4;
      return m;
    };

    const gL = mk(
      new THREE.BoxGeometry(wSide, h, TILE_SIZE * 0.96),
      cxSide,
      0,
    );
    const gR = mk(
      new THREE.BoxGeometry(wSide, h, TILE_SIZE * 0.96),
      -cxSide,
      0,
    );

    const wCap = wSide * 0.98;
    const zF = halfLenZ - capZ * 0.5;
    const zB = -halfLenZ + capZ * 0.5;

    const gFL = mk(new THREE.BoxGeometry(wCap, h, capZ), cxSide, zF);
    const gFR = mk(new THREE.BoxGeometry(wCap, h, capZ), -cxSide, zF);
    const gBL = mk(new THREE.BoxGeometry(wCap, h, capZ), cxSide, zB);
    const gBR = mk(new THREE.BoxGeometry(wCap, h, capZ), -cxSide, zB);

    this.group.add(gL, gR, gFL, gFR, gBL, gBR);
  }

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = cx;
    this.oz = cz;
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.narrow = BALL_RADIUS * 1.65;

    const bridgeGlb = assetRegistry.getModelClone("hazard_bridge");
    if (bridgeGlb) {
      this.group.add(bridgeGlb);
      this.group.position.set(cx, 0, cz);
      this.addBridgeHazardSurround(rotationY);
      return;
    }

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(this.narrow * 2, 0.12, TILE_SIZE * 0.88),
      warmCreamStone(),
    );
    deck.position.y = -0.02;
    deck.rotation.y = rotationY;
    this.group.add(deck);

    this.addBridgeHazardSurround(rotationY);

    this.group.position.set(cx, 0, cz);
  }

  checkBridgeOob(ctx: HazardBallContext): boolean {
    const loc = worldToLocalXZ(
      ctx.position.x,
      ctx.position.z,
      this.ox,
      this.oz,
      this.rx,
      this.rz,
      this.fx,
      this.fz,
    );
    const onTile =
      Math.abs(loc.lz) < TILE_SIZE * 0.46 &&
      Math.abs(loc.lx) < LANE_HALF_WIDTH * 1.05;
    if (!onTile) return false;
    return Math.abs(loc.lx) > this.narrow + ctx.radius * 0.25;
  }
}

class BoostPadHazard extends BaseHazard {
  readonly hazardType = "boost";
  private readonly ox: number;
  private readonly oz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly rx: number;
  private readonly rz: number;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = cx;
    this.oz = cz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.rx = b.rx;
    this.rz = b.rz;

    const arrowMat = boostPadArrowBlue();
    for (let i = -2; i <= 2; i++) {
      const a = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.4, 5, 1, false),
        arrowMat,
      );
      a.rotation.x = Math.PI / 2;
      a.position.set(0, 0.052, i * 1.05);
      a.renderOrder = 2;
      this.group.add(a);
    }

    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_WIDTH * 0.36, TILE_SIZE * 0.7),
      new THREE.MeshBasicMaterial({
        color: 0x256eeb,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.006;
    strip.renderOrder = 1;
    this.group.add(strip);

    this.group.position.set(cx, 0, cz);
    this.group.rotation.y = rotationY;
  }

  accumulateEnvironment(
    ctx: HazardBallContext,
    env: HazardEnvironmental,
  ): void {
    const loc = worldToLocalXZ(
      ctx.position.x,
      ctx.position.z,
      this.ox,
      this.oz,
      this.rx,
      this.rz,
      this.fx,
      this.fz,
    );
    if (Math.abs(loc.lx) > LANE_HALF_WIDTH * 0.5) return;
    if (loc.lz < -TILE_SIZE * 0.41 || loc.lz > TILE_SIZE * 0.41) return;
    const push = 34;
    env.accelX += this.fx * push;
    env.accelZ += this.fz * push;
  }
}

class AxeHazard extends BaseHazard {
  readonly hazardType = "axe";
  /** Monotonic spin angle (rad) — blade + hit zone stay one direction */
  private phase = 0;
  private readonly cx: number;
  private readonly cz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly bladeAnim: THREE.Object3D;
  private readonly orbitR: number;
  private readonly spin = 2.15;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.cx = cx;
    this.cz = cz;
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;

    const axeGlb = assetRegistry.getModelClone("hazard_axe");
    const orbitBase = 1.42 * AXE_SCALE;
    this.orbitR = axeGlb
      ? orbitBase * (AXE_GLB_SCALE / AXE_SCALE)
      : orbitBase;
    if (axeGlb) {
      this.group.add(axeGlb);
      this.bladeAnim =
        axeGlb.getObjectByName("axeBlade") ?? axeGlb;
      this.group.scale.setScalar(AXE_GLB_SCALE);
      this.group.position.set(cx, 0, cz);
      return;
    }

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(1.52 * AXE_SCALE, 0.28 * AXE_SCALE, 0.36 * AXE_SCALE),
      bladeSteel(),
    );
    blade.name = "axeBlade";
    blade.position.set(b.fx * 1.28 * AXE_SCALE, 0.58 * AXE_SCALE, b.fz * 1.28 * AXE_SCALE);
    this.group.add(blade);
    this.bladeAnim = blade;

    const pivot = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * AXE_SCALE, 0.78 * AXE_SCALE, 0.18 * AXE_SCALE),
      woodBrown(),
    );
    pivot.position.y = 0.92 * AXE_SCALE;
    this.group.add(pivot);

    this.group.position.set(cx, 0, cz);
  }

  update(dt: number): void {
    super.update(dt);
    this.phase += dt * this.spin;
    this.bladeAnim.rotation.y = this.phase;
  }

  resolveImpulses(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
    _dt: number,
  ): boolean {
    void _dt;
    const c = Math.cos(this.phase);
    const s = Math.sin(this.phase);
    const bx =
      this.cx + this.orbitR * (c * this.rx + s * this.fx);
    const bz =
      this.cz + this.orbitR * (c * this.rz + s * this.fz);

    const dx = ctx.position.x - bx;
    const dz = ctx.position.z - bz;
    const dist = Math.hypot(dx, dz);
    if (dist > ctx.radius + 0.68) return false;
    if (!this.canRegisterHit()) return false;

    /** Bounce backward along -forward */
    const backX = -this.fx;
    const backZ = -this.fz;
    const speed = 15;
    physics.velocity.x = backX * speed;
    physics.velocity.z = backZ * speed;

    ctx.position.x += backX * ctx.radius * 0.35;
    ctx.position.z += backZ * ctx.radius * 0.35;
    this.markHit(0.42);
    return true;
  }
}

function tileKey(t: { gridX: number; gridZ: number }): string {
  return `${t.gridX},${t.gridZ}`;
}

export function createHazardInstances(
  specs: HazardSpawnSpec[],
  tiles: {
    gridX: number;
    gridZ: number;
    worldX: number;
    worldZ: number;
    railOriginX?: number;
    railOriginZ?: number;
    rotationY: number;
  }[],
): HazardInstance[] {
  const out: HazardInstance[] = [];

  for (const spec of specs) {
    const tile = tiles[spec.tileIndex];
    if (!tile) continue;

    const key = tileKey(tile);
    const cx = tile.railOriginX ?? tile.worldX;
    const cz = tile.railOriginZ ?? tile.worldZ;
    const rot = tile.rotationY;

    let h: HazardInstance;
    switch (spec.kind) {
      case "windmill":
        h = new WindmillHazard(spec.id, spec.weight, key, cx, cz, rot);
        break;
      case "sandpit":
        h = new SandpitHazard(spec.id, spec.weight, key, cx, cz, rot);
        break;
      case "fan":
        h = new FanHazard(
          spec.id,
          spec.weight,
          key,
          cx,
          cz,
          rot,
          spec.fanSign ?? 1,
        );
        break;
      case "bridge":
        h = new BridgeHazard(spec.id, spec.weight, key, cx, cz, rot);
        break;
      case "boost":
        h = new BoostPadHazard(spec.id, spec.weight, key, cx, cz, rot);
        break;
      case "axe":
        h = new AxeHazard(spec.id, spec.weight, key, cx, cz, rot);
        break;
      default: {
        const _: never = spec.kind;
        void _;
        continue;
      }
    }
    out.push(h);
  }

  return out;
}
