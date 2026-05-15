import * as THREE from "three";
import { assetRegistry } from "../../art/AssetRegistry";
import { hazardBridgeGapRed, warmCreamStone } from "../../art/Materials";
import { BALL_RADIUS } from "../../core/Constants";
import {
  LANE_HALF_WIDTH,
  TILE_SIZE,
} from "../../level/TileDimensions";
import type { HazardBallContext } from "../Hazard";
import { BaseHazard } from "../baseHazard";
import {
  HAZARD_SPAN_BRIDGE,
  scaleImportedHazardToHorizontalSpan,
  tileBasis,
  worldToLocalXZ,
} from "../hazardSpatialUtils";

export class BridgeHazard extends BaseHazard {
  readonly hazardType = "bridge";
  private readonly ox: number;
  private readonly oz: number;
  private readonly rx: number;
  private readonly rz: number;
  private readonly fx: number;
  private readonly fz: number;
  private readonly narrow: number;

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
