import type { Vec3Like } from "../core/math";

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TransformState {
  position: Vec3Like;
  rotation: QuatLike;
  scale: Vec3Like;
}

export type WorldObjectLifetime = "persistent" | "pooled" | "oneShot";
export type WorldObjectReplication = "sharedGameplay" | "localCosmetic";

export interface WorldObjectState {
  objectId: string;
  templateId: string;
  transform: TransformState;
  visible: boolean;
  lifetime: WorldObjectLifetime;
  replication: WorldObjectReplication;
  tags: readonly string[];
}

export interface CameraState {
  mode: "fixed" | "follow" | "orbit" | "cinematic";
  position: Vec3Like;
  target?: Vec3Like;
  rotation?: QuatLike;
  fovDeg: number;
  shake?: {
    intensity: number;
    remainingSec: number;
  };
}

export interface RenderWorldState {
  levelId: string;
  camera: CameraState;
  objects: readonly WorldObjectState[];
}

export function yawToQuat(yaw: number): QuatLike {
  const half = yaw * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}

