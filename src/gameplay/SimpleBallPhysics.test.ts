import { describe, expect, it } from "vitest";
import { SimpleBallPhysics } from "./SimpleBallPhysics";
import type { CourseSurface, LevelWorldBounds } from "../level/LevelTypes";

const bounds: LevelWorldBounds = {
  minX: -20,
  maxX: 20,
  minZ: -20,
  maxZ: 20,
};

function flatSurface(y = 0): CourseSurface {
  return {
    patches: [
      {
        kind: "flat",
        cx: 0,
        cz: 0,
        y,
        halfWidth: 20,
        halfLength: 20,
        rotationY: 0,
      },
    ],
  };
}

describe("SimpleBallPhysics", () => {
  it("rolls and settles on a flat surface without Three.js vectors", () => {
    const physics = new SimpleBallPhysics(0.32, bounds, bounds.maxZ, flatSurface());
    const position = { x: 0, y: 0, z: 0 };

    physics.applyShot({ x: 1, y: 0 }, 3);
    for (let i = 0; i < 600 && !physics.isSettled(); i++) {
      const result = physics.step(position, 1 / 60);
      expect(result.oob).not.toBe(true);
    }

    expect(physics.isSettled()).toBe(true);
    expect(position.x).toBeGreaterThan(0.8);
    expect(position.y).toBeCloseTo(0);
  });

  it("reports OOB when unsupported motion falls below the recovery height", () => {
    const physics = new SimpleBallPhysics(0.32, bounds, bounds.maxZ);
    const position = { x: 0, y: -18, z: 0 };

    physics.applyShot({ x: 0, y: 1 }, 1);
    const result = physics.step(position, 1 / 60);

    expect(result.oob).toBe(true);
  });

  it("pushes the ball out of rail capsules and records surface contact", () => {
    const physics = new SimpleBallPhysics(0.32, bounds, bounds.maxZ, flatSurface());
    const position = { x: 0.72, y: 0, z: 0 };
    physics.setRailColliders([{ ax: 1, az: -4, bx: 1, bz: 4, yMin: -0.2, yMax: 0.2 }]);

    physics.applyShot({ x: 1, y: 0 }, 2);
    physics.step(position, 1 / 60);

    expect(position.x).toBeLessThan(1);
    expect(physics.consumeSurfaceContact()).toBe(true);
  });

  it("samples ramp support and climbs above the low deck", () => {
    const physics = new SimpleBallPhysics(0.32, bounds, bounds.maxZ, {
      patches: [
        {
          kind: "ramp",
          cx: 0,
          cz: 0,
          y: 0,
          lowY: 0,
          highY: 2,
          halfWidth: 4,
          halfLength: 6,
          rotationY: 0,
        },
      ],
    });
    const position = { x: 0, y: 0, z: -5 };

    physics.applyShot({ x: 0, y: 1 }, 5);
    for (let i = 0; i < 90; i++) physics.step(position, 1 / 60);

    expect(position.z).toBeGreaterThan(-5);
    expect(position.y).toBeGreaterThan(0.15);
  });
});
