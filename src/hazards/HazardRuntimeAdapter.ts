import type { Vec3Like } from "../core/math";
import type { HazardKind } from "./HazardTypes";
import {
  evaluateHazardEffect,
  type HazardEffectResult,
  type HazardRuntimeContext,
} from "./HazardSimulationContract";

export interface HazardRuntimeAdapterInput {
  kind: HazardKind;
  ballPosition: Vec3Like;
  ballVelocity?: Vec3Like;
  ballRadius: number;
  hazardPosition: Vec3Like;
  hazardRadius: number;
  fanSign?: 1 | -1;
  pairedTarget?: Vec3Like;
  portalMode?: "pair" | "finish";
}

export function createHazardRuntimeContext(
  input: HazardRuntimeAdapterInput,
): HazardRuntimeContext {
  return {
    kind: input.kind,
    ballPosition: input.ballPosition,
    ...(input.ballVelocity ? { ballVelocity: input.ballVelocity } : {}),
    ballRadius: input.ballRadius,
    hazardPosition: input.hazardPosition,
    hazardRadius: input.hazardRadius,
    ...(input.fanSign ? { fanSign: input.fanSign } : {}),
    ...(input.pairedTarget ? { pairedTarget: input.pairedTarget } : {}),
  };
}

export function evaluateWebHazardContract(
  input: HazardRuntimeAdapterInput,
): HazardEffectResult {
  if (input.kind === "portal_gate" && input.portalMode === "finish") {
    const result = evaluateHazardEffect(
      createHazardRuntimeContext({
        ...input,
        pairedTarget: input.pairedTarget ?? input.hazardPosition,
      }),
    );
    return result.type === "teleports"
      ? { ...result, finish: true }
      : result;
  }
  return evaluateHazardEffect(createHazardRuntimeContext(input));
}
