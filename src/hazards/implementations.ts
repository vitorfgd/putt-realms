import * as THREE from "three";
import { assetRegistry } from "../art/AssetRegistry";
import {
  boostPadArrowBlue,
  fanStone,
  hazardBridgeGapRed,
  holeCupPortalSurfaceMaterial,
  PSX_SKY_BLUE,
  sandGold,
  warmCreamStone,
} from "../art/Materials";
import { BALL_RADIUS } from "../core/Constants";
import type { SimpleBallPhysics } from "../gameplay/SimpleBallPhysics";
import type { HazardSpawnSpec } from "../level/LevelTypes";
import {
  LANE_HALF_WIDTH,
  LANE_WIDTH,
  TILE_SIZE,
} from "../level/TileDimensions";
import type {
  HazardBallContext,
  HazardEnvironmental,
  HazardInstance,
  PortalTriggerResult,
} from "./Hazard";

const ARM_THICK = 0.28;
/** Visual + collision scale for procedural windmill */
const WINDMILL_SCALE = 0.775;
const FAN_GLB_SPIN_RATE = 10;

/**
 * Imported FBX/GLB hazard meshes are often authored in cm or arbitrary units.
 * Uniform scale so max(X,Z) bbox extent matches target world span (~tile/lane scale).
 */
function scaleImportedHazardToHorizontalSpan(
  root: THREE.Object3D,
  targetSpanXZ: number,
): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1e-6);
  if (!Number.isFinite(span)) return;
  root.scale.setScalar(targetSpanXZ / span);
}

/** Target horizontal footprint (world units) per hazard after auto-scale */
const HAZARD_SPAN_WINDMILL = 5.2;
const HAZARD_SPAN_FAN = 2.5;
const HAZARD_SPAN_BRIDGE = 6;
const HAZARD_SPAN_BUMPER = 2.05;
const HAZARD_SPAN_PORTAL = 2.35;
const HAZARD_SPAN_BOOST = 4.3;
const HAZARD_SPAN_SAND = 4.8;

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

/** FBX/GLB windmills often add a grey pole/mast; hide by name so only spinning arms read */
function hideWindmillGreyStaticParts(
  root: THREE.Object3D,
  spinRoots: readonly THREE.Object3D[],
): void {
  const re =
    /pole|mast|tower|column|stem|post|stand|pylon|pedestal|mount|shaft|hub|bearing/i;
  const underSpin = (mesh: THREE.Mesh): boolean => {
    for (const arm of spinRoots) {
      let p: THREE.Object3D | null = mesh.parent;
      while (p) {
        if (p === arm) return true;
        p = p.parent;
      }
    }
    return false;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (spinRoots.includes(o)) return;
    if (underSpin(o)) return;
    if (re.test(o.name)) o.visible = false;
  });
}

/** Blender/FBX names often use `_` / `.001`; normalize so `windmill_arm` matches `windmillArm`. */
function normalizeForAssetMatch(name: string): string {
  return name.toLowerCase().replace(/[-\s_.]/g, "");
}

/**
 * When named spin nodes are missing, prefer a mesh-bearing sibling under the same parent
 * (typical FBX: static base + rotor group) instead of spinning the whole file root.
 */
function collectSpinFallbackTargets(root: THREE.Object3D): THREE.Object3D[] {
  const staticHint =
    /base|bottom|stand|pole|mast|tower|column|stem|post|pylon|pedestal|foundation|ground|deck|housing|body|mount/i;

  const containsMesh = (o: THREE.Object3D): boolean => {
    let found = false;
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) found = true;
    });
    return found;
  };

  const horizontalSpan = (o: THREE.Object3D): number => {
    const box = new THREE.Box3().setFromObject(o);
    const sz = box.getSize(new THREE.Vector3());
    return Math.max(sz.x, sz.z);
  };

  const scoreNode = (s: THREE.Object3D): number => {
    const span = horizontalSpan(s);
    const penalty =
      staticHint.test(s.name) ||
      staticHint.test(normalizeForAssetMatch(s.name))
        ? 0.35
        : 1;
    return span * penalty;
  };

  root.updateMatrixWorld(true);

  let parents: THREE.Object3D[] = [root];
  const expanded = new Set<string>([root.uuid]);

  while (parents.length > 0) {
    const nextParents: THREE.Object3D[] = [];

    for (const p of parents) {
      const meshKids = p.children.filter(containsMesh);
      if (meshKids.length >= 2) {
        const sorted = [...meshKids].sort((a, b) => scoreNode(b) - scoreNode(a));
        return [sorted[0]!];
      }
      for (const ch of meshKids) {
        if (!expanded.has(ch.uuid)) {
          expanded.add(ch.uuid);
          nextParents.push(ch);
        }
      }
    }

    parents = nextParents;
  }

  const meshKids = root.children.filter(containsMesh);
  if (meshKids.length === 1) {
    return [meshKids[0]!];
  }
  return [root];
}

/**
 * FBX exports: name rotating blade/arm objects with a `windmillArm` prefix (e.g. `windmillArm`,
 * `windmill_arm`, `windmillArm.001`) so each gets {@link THREE.Object3D.rotation.y} driven in sync.
 */
function collectWindmillSpinTargets(root: THREE.Object3D): THREE.Object3D[] {
  const seen = new Set<string>();
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.name?.trim()) return;
    const compact = normalizeForAssetMatch(o.name);
    if (/^windmillarm/.test(compact)) {
      if (!seen.has(o.uuid)) {
        seen.add(o.uuid);
        out.push(o);
      }
    }
  });
  if (out.length === 0) {
    const named = root.getObjectByName("windmillArm");
    if (named && !seen.has(named.uuid)) {
      out.push(named);
    }
  }
  if (out.length === 0) {
    return collectSpinFallbackTargets(root);
  }
  return out;
}

/**
 * Fan FBX: prefix `fanArm`, `fanBlade`, `fanRotor`, or bare `blade` / `propeller` / `rotor` + digits.
 */
function collectFanSpinTargets(root: THREE.Object3D): THREE.Object3D[] {
  const seen = new Set<string>();
  const out: THREE.Object3D[] = [];
  const tryAdd = (o: THREE.Object3D | null | undefined) => {
    if (!o || seen.has(o.uuid)) return;
    seen.add(o.uuid);
    out.push(o);
  };
  tryAdd(root.getObjectByName("fanBlades"));
  tryAdd(root.getObjectByName("fanBlade"));
  tryAdd(root.getObjectByName("fanArm"));
  root.traverse((o) => {
    if (!o.name?.trim()) return;
    const n = normalizeForAssetMatch(o.name);
    if (/^fan(arm|blade|rotor)/.test(n) || /^(blade|propeller|rotor)\d*$/.test(n)) {
      tryAdd(o);
    }
  });
  if (out.length === 0) {
    return collectSpinFallbackTargets(root);
  }
  return out;
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
  /** Spin targets — procedural arm or FBX nodes named `windmillArm*` */
  private readonly armSpins: THREE.Object3D[];

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
      this.armSpins = collectWindmillSpinTargets(glb);
      hideWindmillGreyStaticParts(glb, this.armSpins);
      this.group.position.set(cx, deckY, cz);
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
    this.armSpins = [arm];

    this.group.position.set(cx, deckY, cz);
    this.group.rotation.y = rotationY;
    this.syncArmCollisionFromMesh();
  }

  /** Align segment length + hit thickness with the actual scaled mesh (fixes FBX vs math mismatch). */
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
    this.angle += this.spin * dt;
    /** Monotonic Y — same spin sense forever (no sin back-and-forth) */
    for (const part of this.armSpins) {
      part.rotation.y = this.angle;
    }
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
    deckY = 0,
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

    const sandModel = assetRegistry.getModelClone("hazard_sandpit");
    if (sandModel) {
      sandModel.rotation.y = rotationY;
      scaleImportedHazardToHorizontalSpan(sandModel, HAZARD_SPAN_SAND);
      this.group.add(sandModel);
    } else {
      const sand = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfW * 2, 0.08, this.halfL * 2),
        sandGold(),
      );
      sand.position.y = -0.09;
      sand.rotation.y = rotationY;
      this.group.add(sand);
    }
    this.group.position.set(cx, deckY, cz);
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
  private fanSpinParts: THREE.Object3D[] = [];
  private fanAngle = 0;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    cx: number,
    cz: number,
    rotationY: number,
    fanSign: 1 | -1,
    deckY = 0,
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
      scaleImportedHazardToHorizontalSpan(fanGlb, HAZARD_SPAN_FAN);
      this.group.add(fanGlb);
      this.fanSpinParts = collectFanSpinTargets(fanGlb);
      this.group.position.set(cx, deckY, cz);
      this.group.rotation.y = rotationY;
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

    this.group.position.set(cx, deckY, cz);
  }

  update(dt: number): void {
    super.update(dt);
    if (this.fanSpinParts.length === 0) return;
    this.fanAngle += FAN_GLB_SPIN_RATE * dt;
    for (const p of this.fanSpinParts) {
      p.rotation.y = this.fanAngle;
    }
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
    deckY = 0,
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
      scaleImportedHazardToHorizontalSpan(bridgeGlb, HAZARD_SPAN_BRIDGE);
      this.group.add(bridgeGlb);
      this.group.position.set(cx, deckY, cz);
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

    this.group.position.set(cx, deckY, cz);
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
    deckY = 0,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = cx;
    this.oz = cz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.rx = b.rx;
    this.rz = b.rz;

    const boostModel = assetRegistry.getModelClone("hazard_boost");
    if (boostModel) {
      scaleImportedHazardToHorizontalSpan(boostModel, HAZARD_SPAN_BOOST);
      this.group.add(boostModel);
      this.group.position.set(cx, deckY, cz);
      this.group.rotation.y = rotationY;
      return;
    }

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

    this.group.position.set(cx, deckY, cz);
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

const BUMPER_RADIUS = 1.05;
const PORTAL_TRIGGER_RADIUS = 1.12;
const PORTAL_COOLDOWN_SEC = 0.38;

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

class BumperMushroomHazard extends BaseHazard {
  readonly hazardType = "bumper_mushroom";
  private readonly ox: number;
  private readonly oz: number;
  /** Meshes live here so we can pulse scale without fighting import scale */
  private readonly visualRoot = new THREE.Group();
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
  ) {
    super(id, weight, tileKey);
    this.ox = cx;
    this.oz = cz;

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
      /** Brief pinball “pop”: widen in XZ, slight squash on Y */
      this.visualRoot.scale.set(
        1 + stretch * 1.12,
        1 - stretch * 0.22,
        1 + stretch * 1.12,
      );
    } else {
      this.visualRoot.scale.set(1, 1, 1);
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
    const capY = 0.38;
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
    const hitR = BUMPER_RADIUS + ctx.radius * 0.85;
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

class PortalGateHazard extends BaseHazard {
  readonly hazardType = "portal_gate";
  private static readonly pairCooldownUntilSec = new Map<string, number>();

  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly exitX?: number;
  private readonly exitZ?: number;
  private readonly exitY?: number;
  private readonly exitFx?: number;
  private readonly exitFz?: number;
  private readonly portalPairId?: string;
  private readonly portalMode: "pair" | "finish";
  /** Two single-sided discs share the live portal texture (clone+DoubleSide stayed white — texture loads on singleton only). */
  private readonly portalSwirlRoot: THREE.Group;
  private readonly portalSwirlGeometry: THREE.BufferGeometry;
  private swirlAngle = 0;

  constructor(
    id: string,
    weight: number,
    tileKey: string,
    ox: number,
    oz: number,
    rotationY: number,
    deckY: number,
    portalMode: "pair" | "finish",
    exitX?: number,
    exitZ?: number,
    exitY?: number,
    exitFx?: number,
    exitFz?: number,
    portalPairId?: string,
  ) {
    super(id, weight, tileKey);
    const b = tileBasis(rotationY);
    this.ox = ox;
    this.oz = oz;
    this.rx = b.rx;
    this.rz = b.rz;
    this.fx = b.fx;
    this.fz = b.fz;
    this.exitX = exitX;
    this.exitZ = exitZ;
    this.exitY = exitY;
    this.exitFx = exitFx;
    this.exitFz = exitFz;
    this.portalPairId = portalPairId;
    this.portalMode = portalMode;

    const portalGlb = assetRegistry.getModelClone("hazard_portal_gate");
    if (portalGlb) {
      scaleImportedHazardToHorizontalSpan(portalGlb, HAZARD_SPAN_PORTAL);
      this.group.add(portalGlb);
    } else {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.09, 10, 28),
        new THREE.MeshBasicMaterial({
          color: 0x8b5cff,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      this.group.add(ring);
      const inner = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 28),
        new THREE.MeshBasicMaterial({
          color: 0x4b2066,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.062;
      this.group.add(inner);
    }

    const swirlMat = holeCupPortalSurfaceMaterial();
    this.portalSwirlGeometry = new THREE.CircleGeometry(0.98, 40);
    const swirlFront = new THREE.Mesh(this.portalSwirlGeometry, swirlMat);
    swirlFront.name = "PortalGateSwirlFront";
    const swirlBack = new THREE.Mesh(this.portalSwirlGeometry, swirlMat);
    swirlBack.name = "PortalGateSwirlBack";
    /** Face −local Z so the same texture reads from behind (no material clone). */
    swirlBack.rotation.y = Math.PI;

    this.portalSwirlRoot = new THREE.Group();
    this.portalSwirlRoot.name = "PortalGateSwirlRoot";
    this.portalSwirlRoot.add(swirlFront);
    this.portalSwirlRoot.add(swirlBack);
    /** Vertical disc (XY); deeper −local Z, lower Y, larger radius than prior tweaks */
    this.portalSwirlRoot.position.set(
      0,
      HAZARD_SPAN_PORTAL * 0.34 - 0.18,
      -0.24,
    );
    this.portalSwirlRoot.renderOrder = 5;
    this.group.add(this.portalSwirlRoot);

    this.group.position.set(ox, deckY, oz);
    this.group.rotation.y = rotationY;
  }

  update(dt: number): void {
    super.update(dt);
    this.swirlAngle += dt * 1.55;
    this.portalSwirlRoot.rotation.z = this.swirlAngle;
  }

  private static pairCooldownExpired(pairId: string): boolean {
    const now = performance.now() * 0.001;
    const until = PortalGateHazard.pairCooldownUntilSec.get(pairId) ?? 0;
    return now >= until;
  }

  private static armPairCooldown(pairId: string): void {
    const now = performance.now() * 0.001;
    PortalGateHazard.pairCooldownUntilSec.set(pairId, now + PORTAL_COOLDOWN_SEC);
  }

  tryPortal(
    ctx: HazardBallContext,
    physics: SimpleBallPhysics,
  ): PortalTriggerResult {
    if (
      this.portalMode === "pair" &&
      (!this.portalPairId || !PortalGateHazard.pairCooldownExpired(this.portalPairId))
    ) {
      return false;
    }

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
    const r = Math.hypot(loc.lx, loc.lz);
    if (r > PORTAL_TRIGGER_RADIUS + ctx.radius * 0.55) return false;

    if (this.portalMode === "finish") {
      ctx.position.x = this.ox;
      ctx.position.z = this.oz;
      const sy = physics.surfaceHeightAt(ctx.position.x, ctx.position.z);
      ctx.position.y = sy ?? ctx.position.y;
      physics.velocity.set(0, 0, 0);
      return "finish";
    }

    if (
      this.exitX === undefined ||
      this.exitZ === undefined ||
      this.exitY === undefined ||
      this.exitFx === undefined ||
      this.exitFz === undefined ||
      !this.portalPairId
    ) {
      return false;
    }

    const push = TILE_SIZE * 0.24;
    ctx.position.x = this.exitX + this.exitFx * push;
    ctx.position.z = this.exitZ + this.exitFz * push;

    const sy = physics.surfaceHeightAt(ctx.position.x, ctx.position.z);
    if (sy !== null) {
      ctx.position.y = sy;
    } else {
      ctx.position.y = this.exitY;
    }

    PortalGateHazard.armPairCooldown(this.portalPairId);
    return "teleport";
  }

  dispose(): void {
    this.group.remove(this.portalSwirlRoot);
    this.portalSwirlGeometry.dispose();
    super.dispose();
  }
}

function tileKey(t: { gridX: number; gridZ: number }): string {
  return `${t.gridX},${t.gridZ}`;
}

function findPortalPartnerSpec(
  specs: readonly HazardSpawnSpec[],
  self: HazardSpawnSpec,
): HazardSpawnSpec | undefined {
  if (
    self.kind !== "portal_gate" ||
    !self.portalPairId ||
    self.portalRole === undefined
  ) {
    return undefined;
  }
  return specs.find(
    (s) =>
      s.kind === "portal_gate" &&
      s.portalPairId === self.portalPairId &&
      s.portalRole !== undefined &&
      s.portalRole !== self.portalRole &&
      s.tileIndex !== self.tileIndex,
  );
}

export function createHazardInstances(
  specs: HazardSpawnSpec[],
  tiles: {
    gridX: number;
    gridZ: number;
    worldX: number;
    worldY?: number;
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
    const deckY = tile.worldY ?? 0;

    let h: HazardInstance;
    switch (spec.kind) {
      case "windmill":
        h = new WindmillHazard(spec.id, spec.weight, key, cx, cz, rot, deckY);
        break;
      case "sandpit":
        h = new SandpitHazard(spec.id, spec.weight, key, cx, cz, rot, deckY);
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
          deckY,
        );
        break;
      case "bridge":
        h = new BridgeHazard(spec.id, spec.weight, key, cx, cz, rot, deckY);
        break;
      case "boost":
        h = new BoostPadHazard(spec.id, spec.weight, key, cx, cz, rot, deckY);
        break;
      case "bumper_mushroom":
        h = new BumperMushroomHazard(
          spec.id,
          spec.weight,
          key,
          cx,
          cz,
          rot,
          deckY,
        );
        break;
      case "portal_gate": {
        const px = spec.portalSpawnWorldX ?? cx;
        const pz = spec.portalSpawnWorldZ ?? cz;
        const pDeckY = spec.portalSpawnDeckY ?? deckY;
        const portalRot =
          (spec.portalSpawnRotationY ?? rot) + Math.PI;
        if (spec.portalMode === "finish") {
          h = new PortalGateHazard(
            spec.id,
            spec.weight,
            key,
            px,
            pz,
            portalRot,
            pDeckY,
            "finish",
          );
          break;
        }
        const partner = findPortalPartnerSpec(specs, spec);
        if (!partner) continue;
        const exitTile = tiles[partner.tileIndex];
        if (!exitTile) continue;
        const exitX =
          partner.portalSpawnWorldX ??
          (exitTile.railOriginX ?? exitTile.worldX);
        const exitZ =
          partner.portalSpawnWorldZ ??
          (exitTile.railOriginZ ?? exitTile.worldZ);
        const exitY = partner.portalSpawnDeckY ?? (exitTile.worldY ?? 0);
        const bOut = tileBasis(exitTile.rotationY);
        if (!spec.portalPairId) continue;
        h = new PortalGateHazard(
          spec.id,
          spec.weight,
          key,
          px,
          pz,
          portalRot,
          pDeckY,
          "pair",
          exitX,
          exitZ,
          exitY,
          bOut.fx,
          bOut.fz,
          spec.portalPairId,
        );
        break;
      }
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
