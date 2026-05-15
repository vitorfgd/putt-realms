import type { Vec2Like, Vec3Like } from "../core/math";

export type ShotIntentSource = "pointer" | "controller" | "keyboard" | "replay";

export interface ShotIntent {
  directionXZ: Vec2Like;
  power01: number;
  startWorld: Vec3Like;
  source: ShotIntentSource;
}

