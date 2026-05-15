export interface Vec2Like {
  x: number;
  y: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3Like {
  min: Vec3Like;
  max: Vec3Like;
}

export interface Bounds2Like {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class MutableVec3 implements Vec3Like {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vec3Like): this {
    return this.set(v.x, v.y, v.z);
  }

  clone(): MutableVec3 {
    return new MutableVec3(this.x, this.y, this.z);
  }

  add(v: Vec3Like): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addVectors(a: Vec3Like, b: Vec3Like): this {
    return this.set(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  multiplyScalar(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
}

export function vec3(x = 0, y = 0, z = 0): Vec3Like {
  return { x, y, z };
}

export function cloneVec3(v: Vec3Like): Vec3Like {
  return { x: v.x, y: v.y, z: v.z };
}

export function addVec3(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function negVec3(v: Vec3Like): Vec3Like {
  return { x: -v.x, y: -v.y, z: -v.z };
}

export function distance2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalizeYawRad(yaw: number): number {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function rotateFlatOffset(offset: Vec3Like, rotationY: number): Vec3Like {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return {
    x: offset.x * c + offset.z * s,
    y: offset.y,
    z: -offset.x * s + offset.z * c,
  };
}

export function closestPointOnSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = clamp(ab2 > 1e-10 ? (apx * abx + apz * abz) / ab2 : 0, 0, 1);
  return { x: ax + abx * t, z: az + abz * t };
}
