import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { boostPadArrowBlue } from "../../art/Materials";
import {
  LANE_HALF_WIDTH,
  LANE_WIDTH,
  TILE_SIZE,
} from "../../level/TileDimensions";
import type { HazardBallContext, HazardEnvironmental } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import {
  HAZARD_SPAN_BOOST,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
  worldToLocalXZ,
} from "../hazardSpatialUtils";

export class BoostPadHazard extends BaseHazard {
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
