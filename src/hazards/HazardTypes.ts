export type HazardKind =
  | "windmill"
  | "sandpit"
  | "fan"
  | "bridge"
  | "boost"
  | "bumper_mushroom"
  | "portal_gate";

/** Authoring weights — must match spawn selection */
export const HAZARD_WEIGHT: Record<HazardKind, number> = {
  windmill: 2.5,
  sandpit: 1.5,
  fan: 2.0,
  bridge: 3.5,
  boost: 1.8,
  bumper_mushroom: 2.2,
  portal_gate: 2.8,
};

export function hazardWeight(kind: HazardKind): number {
  return HAZARD_WEIGHT[kind];
}
