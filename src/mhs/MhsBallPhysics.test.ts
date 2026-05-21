import { describe, expect, it } from "vitest";
import {
  BALL_SHOT_LOB_RATIO,
  mhsRailColliderYBand,
  mhsShotVelocityFromPull,
  resolveMhsBallRails,
  stepMhsBallVertical,
} from "../../../putt_realms/scripts/puttrealms/gameplay/MhsBallPhysics";

const BALL_RADIUS = 0.34;

describe("MHS ball physics helpers", () => {
  it("adds real vertical velocity to shot release", () => {
    const velocity = mhsShotVelocityFromPull(2, 0, 48);

    expect(velocity.x).toBeCloseTo(-48, 6);
    expect(velocity.y).toBeCloseTo(48 * BALL_SHOT_LOB_RATIO, 6);
    expect(velocity.z).toBeCloseTo(0, 6);
  });

  it("lets an airborne full-power shot clear a rail", () => {
    const rail = {ax: 0, az: -3, bx: 0, bz: 3, ...mhsRailColliderYBand(0)};
    const result = resolveMhsBallRails(
      {x: 0.1, y: rail.yMax + BALL_RADIUS + 0.01, z: 0},
      {x: -12, y: 2, z: 0},
      [rail],
      BALL_RADIUS,
      0.42,
    );

    expect(result.hit).toBe(false);
    expect(result.position.x).toBeCloseTo(0.1, 6);
    expect(result.velocity.x).toBeCloseTo(-12, 6);
    expect(result.velocity.y).toBeCloseTo(2, 6);
  });

  it("still bounces a weak low shot off the rail", () => {
    const rail = {ax: 0, az: -3, bx: 0, bz: 3, ...mhsRailColliderYBand(0)};
    const result = resolveMhsBallRails(
      {x: 0.1, y: rail.yMax, z: 0},
      {x: -12, y: 0, z: 0},
      [rail],
      BALL_RADIUS,
      0.42,
    );

    expect(result.hit).toBe(true);
    expect(result.position.x).toBeGreaterThan(0.1);
    expect(result.velocity.x).toBeGreaterThan(0);
  });

  it("lands an airborne ball back on flat support", () => {
    let y = 0;
    let vy = mhsShotVelocityFromPull(1, 0, 48).y;
    let landed = false;

    for (let i = 0; i < 90 && !landed; i++) {
      const next = stepMhsBallVertical(y, vy, 1 / 60, 0);
      y = next.y;
      vy = next.velocityY;
      landed = next.landed;
    }

    expect(landed).toBe(true);
    expect(y).toBe(0);
    expect(vy).toBe(0);
  });

  it("snaps to ramp support height after descending onto it", () => {
    const next = stepMhsBallVertical(4, -2, 0.2, 3);

    expect(next.landed).toBe(true);
    expect(next.y).toBe(3);
    expect(next.velocityY).toBe(0);
  });

  it("falls below OOB height when unsupported", () => {
    let y = 0;
    let vy = 0;

    for (let i = 0; i < 16; i++) {
      const next = stepMhsBallVertical(y, vy, 0.1, null);
      y = next.y;
      vy = next.velocityY;
    }

    expect(y).toBeLessThan(-16);
  });
});
