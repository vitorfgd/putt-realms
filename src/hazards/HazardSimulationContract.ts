import type { HazardKind } from "./HazardTypes";
import type { Vec3Like } from "../core/math";

export type HazardEffect =
  | "blocks"
  | "slows"
  | "pushes"
  | "narrows"
  | "boosts"
  | "bounces"
  | "teleports";

export interface HazardSimulationContract {
  kind: HazardKind;
  effects: readonly HazardEffect[];
  requiresPairing?: boolean;
  portableState: "stateless" | "timed" | "paired";
  mhsVisualPolicy: "prefab";
}

export interface HazardRuntimeContext {
  kind: HazardKind;
  ballPosition: Vec3Like;
  ballVelocity?: Vec3Like;
  ballRadius: number;
  hazardPosition: Vec3Like;
  hazardRadius: number;
  fanSign?: 1 | -1;
  pairedTarget?: Vec3Like;
}

export type HazardEffectResult =
  | { type: "none" }
  | { type: "blocks"; normalXZ: { x: number; z: number } }
  | { type: "slows"; frictionScale: number }
  | { type: "pushes"; accelX: number; accelZ: number }
  | { type: "narrows"; insideSafeLane: boolean }
  | { type: "boosts"; speedScale: number }
  | { type: "bounces"; impulseX: number; impulseZ: number }
  | { type: "teleports"; target: Vec3Like; finish: boolean };

export const HAZARD_CONTRACT_CONSTANTS = {
  sandpitFrictionScale: 12,
  fanPeakAccel: 16,
  boostSpeedScale: 1.5,
  bumperImpulse: 7.85,
} as const;

export const HAZARD_SIMULATION_CONTRACTS: Record<
  HazardKind,
  HazardSimulationContract
> = {
  windmill: {
    kind: "windmill",
    effects: ["blocks"],
    portableState: "timed",
    mhsVisualPolicy: "prefab",
  },
  sandpit: {
    kind: "sandpit",
    effects: ["slows"],
    portableState: "stateless",
    mhsVisualPolicy: "prefab",
  },
  fan: {
    kind: "fan",
    effects: ["pushes"],
    portableState: "stateless",
    mhsVisualPolicy: "prefab",
  },
  bridge: {
    kind: "bridge",
    effects: ["narrows"],
    portableState: "stateless",
    mhsVisualPolicy: "prefab",
  },
  boost: {
    kind: "boost",
    effects: ["boosts"],
    portableState: "stateless",
    mhsVisualPolicy: "prefab",
  },
  bumper_mushroom: {
    kind: "bumper_mushroom",
    effects: ["bounces"],
    portableState: "stateless",
    mhsVisualPolicy: "prefab",
  },
  portal_gate: {
    kind: "portal_gate",
    effects: ["teleports"],
    requiresPairing: true,
    portableState: "paired",
    mhsVisualPolicy: "prefab",
  },
};

export function evaluateHazardEffect(
  ctx: HazardRuntimeContext,
): HazardEffectResult {
  const contract = HAZARD_SIMULATION_CONTRACTS[ctx.kind];
  if (!contract) return { type: "none" };

  const dx = ctx.ballPosition.x - ctx.hazardPosition.x;
  const dz = ctx.ballPosition.z - ctx.hazardPosition.z;
  const distance = Math.hypot(dx, dz);
  const contactRadius = Math.max(0, ctx.hazardRadius + ctx.ballRadius);
  const touching = distance <= contactRadius;

  switch (ctx.kind) {
    case "windmill":
      return touching
        ? { type: "blocks", normalXZ: normalizedXZ(dx, dz) }
        : { type: "none" };
    case "sandpit":
      return touching
        ? {
            type: "slows",
            frictionScale: HAZARD_CONTRACT_CONSTANTS.sandpitFrictionScale,
          }
        : { type: "none" };
    case "fan":
      return touching
        ? {
            type: "pushes",
            accelX: HAZARD_CONTRACT_CONSTANTS.fanPeakAccel * (ctx.fanSign ?? 1),
            accelZ: 0,
          }
        : { type: "none" };
    case "bridge":
      return {
        type: "narrows",
        insideSafeLane: Math.abs(dx) <= Math.max(0.2, ctx.hazardRadius),
      };
    case "boost":
      return touching
        ? {
            type: "boosts",
            speedScale: HAZARD_CONTRACT_CONSTANTS.boostSpeedScale,
          }
        : { type: "none" };
    case "bumper_mushroom":
      if (!touching) return { type: "none" };
      return {
        type: "bounces",
        impulseX:
          normalizedXZ(dx, dz).x * HAZARD_CONTRACT_CONSTANTS.bumperImpulse,
        impulseZ:
          normalizedXZ(dx, dz).z * HAZARD_CONTRACT_CONSTANTS.bumperImpulse,
      };
    case "portal_gate":
      if (!touching || !ctx.pairedTarget) return { type: "none" };
      return { type: "teleports", target: ctx.pairedTarget, finish: false };
  }
}

function normalizedXZ(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 1, z: 0 };
  return { x: x / len, z: z / len };
}
