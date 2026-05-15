import { describe, expect, it } from "vitest";
import { HAZARD_WEIGHT } from "./HazardTypes";
import {
  evaluateHazardEffect,
  HAZARD_CONTRACT_CONSTANTS,
  HAZARD_SIMULATION_CONTRACTS,
  type HazardRuntimeContext,
} from "./HazardSimulationContract";
import { evaluateWebHazardContract } from "./HazardRuntimeAdapter";

describe("HAZARD_SIMULATION_CONTRACTS", () => {
  it("covers every hazard kind with a portable behavior contract", () => {
    expect(Object.keys(HAZARD_SIMULATION_CONTRACTS).sort()).toEqual(
      Object.keys(HAZARD_WEIGHT).sort(),
    );
    for (const contract of Object.values(HAZARD_SIMULATION_CONTRACTS)) {
      expect(contract.effects.length).toBeGreaterThan(0);
      expect(contract.mhsVisualPolicy).toBe("prefab");
    }
  });

  it("marks portal gates as paired teleport hazards", () => {
    expect(HAZARD_SIMULATION_CONTRACTS.portal_gate).toMatchObject({
      effects: ["teleports"],
      requiresPairing: true,
      portableState: "paired",
    });
  });

  it("evaluates portable hazard effects without Three meshes", () => {
    const base: Omit<HazardRuntimeContext, "kind"> = {
      ballPosition: { x: 0.25, y: 0, z: 0 },
      ballRadius: 0.2,
      hazardPosition: { x: 0, y: 0, z: 0 },
      hazardRadius: 0.5,
    };

    expect(evaluateHazardEffect({ ...base, kind: "windmill" })).toMatchObject({
      type: "blocks",
    });
    expect(evaluateHazardEffect({ ...base, kind: "sandpit" })).toEqual({
      type: "slows",
      frictionScale: HAZARD_CONTRACT_CONSTANTS.sandpitFrictionScale,
    });
    expect(evaluateHazardEffect({ ...base, kind: "fan", fanSign: -1 })).toEqual({
      type: "pushes",
      accelX: -HAZARD_CONTRACT_CONSTANTS.fanPeakAccel,
      accelZ: 0,
    });
    expect(evaluateHazardEffect({ ...base, kind: "bridge" })).toEqual({
      type: "narrows",
      insideSafeLane: true,
    });
    expect(evaluateHazardEffect({ ...base, kind: "boost" })).toEqual({
      type: "boosts",
      speedScale: 1.5,
    });
    expect(evaluateHazardEffect({ ...base, kind: "bumper_mushroom" })).toMatchObject({
      type: "bounces",
    });
    expect(
      evaluateHazardEffect({
        ...base,
        kind: "portal_gate",
        pairedTarget: { x: 10, y: 0, z: 2 },
      }),
    ).toEqual({
      type: "teleports",
      target: { x: 10, y: 0, z: 2 },
      finish: false,
    });
  });

  it("adapts web hazard runtime data to the pure contract", () => {
    const base = {
      ballPosition: { x: 0.25, y: 0, z: 0 },
      ballRadius: 0.2,
      hazardPosition: { x: 0, y: 0, z: 0 },
      hazardRadius: 0.5,
    } as const;

    expect(evaluateWebHazardContract({ ...base, kind: "windmill" })).toMatchObject({
      type: "blocks",
    });
    expect(evaluateWebHazardContract({ ...base, kind: "fan", fanSign: 1 })).toEqual({
      type: "pushes",
      accelX: HAZARD_CONTRACT_CONSTANTS.fanPeakAccel,
      accelZ: 0,
    });
    expect(evaluateWebHazardContract({ ...base, kind: "sandpit" })).toEqual({
      type: "slows",
      frictionScale: HAZARD_CONTRACT_CONSTANTS.sandpitFrictionScale,
    });
    expect(evaluateWebHazardContract({ ...base, kind: "bridge" })).toEqual({
      type: "narrows",
      insideSafeLane: true,
    });
    expect(evaluateWebHazardContract({ ...base, kind: "boost" })).toEqual({
      type: "boosts",
      speedScale: HAZARD_CONTRACT_CONSTANTS.boostSpeedScale,
    });
    expect(evaluateWebHazardContract({ ...base, kind: "bumper_mushroom" })).toMatchObject({
      type: "bounces",
    });
    expect(
      evaluateWebHazardContract({
        ...base,
        kind: "portal_gate",
        pairedTarget: { x: 3, y: 0, z: 4 },
        portalMode: "pair",
      }),
    ).toEqual({
      type: "teleports",
      target: { x: 3, y: 0, z: 4 },
      finish: false,
    });
    expect(
      evaluateWebHazardContract({
        ...base,
        kind: "portal_gate",
        portalMode: "finish",
      }),
    ).toEqual({
      type: "teleports",
      target: { x: 0, y: 0, z: 0 },
      finish: true,
    });
  });
});
