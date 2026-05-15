import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { teleportPortalSwirlMaterial } from "../../art/Materials";
import type { SimpleBallPhysics } from "../../gameplay/SimpleBallPhysics";
import { TILE_SIZE } from "../../level/TileDimensions";
import type {
  HazardBallContext,
  PortalTriggerResult,
} from "../Hazard";
import { BaseHazard } from "../baseHazard";
import {
  HAZARD_SPAN_PORTAL,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
  worldToLocalXZ,
} from "../hazardSpatialUtils";

const PORTAL_TRIGGER_RADIUS = 1.12;
const PORTAL_COOLDOWN_SEC = 0.38;

export class PortalGateHazard extends BaseHazard {
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

    const swirlMat = teleportPortalSwirlMaterial();
    this.portalSwirlGeometry = new THREE.CircleGeometry(0.98, 40);
    const swirlFront = new THREE.Mesh(this.portalSwirlGeometry, swirlMat);
    swirlFront.name = "PortalGateSwirlFront";
    const swirlBack = new THREE.Mesh(this.portalSwirlGeometry, swirlMat);
    swirlBack.name = "PortalGateSwirlBack";
    swirlBack.rotation.y = Math.PI;

    this.portalSwirlRoot = new THREE.Group();
    this.portalSwirlRoot.name = "PortalGateSwirlRoot";
    this.portalSwirlRoot.add(swirlFront);
    this.portalSwirlRoot.add(swirlBack);
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
