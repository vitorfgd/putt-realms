import type { HazardSpawnSpec } from "../level/LevelTypes";
import type { HazardInstance } from "./Hazard";
import { BoostPadHazard } from "./instances/BoostPadHazard";
import { BridgeHazard } from "./instances/BridgeHazard";
import { BumperMushroomHazard } from "./instances/BumperMushroomHazard";
import { FanHazard } from "./instances/FanHazard";
import { PortalGateHazard } from "./instances/PortalGateHazard";
import { SandpitHazard } from "./instances/SandpitHazard";
import { WindmillHazard } from "./instances/WindmillHazard";
import { tileBasis } from "./hazardSpatialUtils";

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
          spec.mushroomVisualScale ?? 1,
        );
        break;
      case "portal_gate": {
        const px = spec.portalSpawnWorldX ?? cx;
        const pz = spec.portalSpawnWorldZ ?? cz;
        const pDeckY = spec.portalSpawnDeckY ?? deckY;
        const portalRot = (spec.portalSpawnRotationY ?? rot) + Math.PI;
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
