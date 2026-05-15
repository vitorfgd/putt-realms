import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { sandGold } from "../../art/Materials";
import {
  LANE_HALF_WIDTH,
  TILE_SIZE,
} from "../../level/TileDimensions";
import type { HazardBallContext, HazardEnvironmental } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import {
  HAZARD_SPAN_SAND,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
  worldToLocalXZ,
} from "../hazardSpatialUtils";

/** Grounded planar drag multiplier while ball is in sand (see physics `frictionScale`). */
const SANDPIT_FRICTION_SCALE = 12;

export class SandpitHazard extends BaseHazard {
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
      env.frictionScale = Math.max(env.frictionScale, SANDPIT_FRICTION_SCALE);
    }
  }
}
