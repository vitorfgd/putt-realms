import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { fanStone, PSX_SKY_BLUE } from "../../art/Materials";
import {
  LANE_HALF_WIDTH,
  TILE_SIZE,
} from "../../level/TileDimensions";
import type { HazardBallContext, HazardEnvironmental } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import { collectFanSpinTargetsFromMeshOrder } from "../glbTwoPartSpin";
import {
  HAZARD_SPAN_FAN,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
  worldToLocalXZ,
} from "../hazardSpatialUtils";
import { collectFanSpinTargets } from "../hazardSpinTargets";

const FAN_GLB_SPIN_RATE = 10;
/** Peak planar acceleration (world units / s²) at full falloff in the fan stream. */
const FAN_PEAK_ACCEL = 16;

export class FanHazard extends BaseHazard {
  readonly hazardType = "fan";
  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly blowDirX: number;
  private readonly blowDirZ: number;
  private fanSpinParts: THREE.Object3D[] = [];
  private fanAngle = 0;
  private fanSpinAxis: "x" | "y" | "z" = "y";

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
    this.blowDirX = b.fx * fanSign;
    this.blowDirZ = b.fz * fanSign;

    const fanGlb = assetRegistry.getModelClone("hazard_fan");
    if (fanGlb) {
      scaleImportedHazardToHorizontalSpan(fanGlb, HAZARD_SPAN_FAN);
      this.group.add(fanGlb);
      const ordered = collectFanSpinTargetsFromMeshOrder(fanGlb);
      if (ordered.length > 0) {
        this.fanSpinParts = ordered;
        this.fanSpinAxis = "z";
      } else {
        this.fanSpinParts = collectFanSpinTargets(fanGlb);
        this.fanSpinAxis = "y";
      }
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
    const a = this.fanAngle;
    const ax = this.fanSpinAxis;
    for (const p of this.fanSpinParts) {
      if (ax === "x") p.rotation.x = a;
      else if (ax === "z") p.rotation.z = a;
      else p.rotation.y = a;
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
    const minAhead = 0.28;
    const maxAhead = TILE_SIZE * 2.1;
    if (
      ahead <= minAhead ||
      ahead >= maxAhead ||
      Math.abs(side) > LANE_HALF_WIDTH * 0.95
    ) {
      return;
    }
    const falloff =
      1 - THREE.MathUtils.smoothstep(minAhead, maxAhead, ahead);
    const a = FAN_PEAK_ACCEL * falloff;
    env.accelX += this.blowDirX * a;
    env.accelZ += this.blowDirZ * a;
  }
}
