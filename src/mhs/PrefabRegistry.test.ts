import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_FILENAMES } from "../art/AssetRegistry";
import { HAZARD_WEIGHT } from "../hazards/HazardTypes";
import { PROCGEN_TILE_TO_ASSET } from "../procgen/procgenAssetKeys";
import {
  HAZARD_KIND_TO_PREFAB_ASSET,
  MHS_ASSET_OPTIMIZATION_BACKLOG,
  MHS_PREFAB_REGISTRY,
} from "./PrefabRegistry";

const modelRoot = join(process.cwd(), "public", "assets", "models");

describe("MHS prefab registry", () => {
  it("has one mapping for every asset key", () => {
    expect(Object.keys(MHS_PREFAB_REGISTRY).sort()).toEqual(
      Object.keys(ASSET_FILENAMES).sort(),
    );
  });

  it("records bundle and size metadata for every prefab entry", () => {
    for (const entry of Object.values(MHS_PREFAB_REGISTRY)) {
      expect(Number.isFinite(entry.sizeBytes)).toBe(true);
      expect(entry.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(["runtime", "debug", "decor"]).toContain(entry.bundle);
      expect(entry.debugOnly).toBe(entry.bundle === "debug");
      expect(entry.futureMhsPrefabName).toBe(entry.mhsPrefab);
      expect(["required", "optional"]).toContain(entry.portRequirement);
      expect(entry.pivotPolicy.length).toBeGreaterThan(0);
      expect(entry.footprint.length).toBeGreaterThan(0);
      expect(entry.futureTemplatePath).toMatch(/^@Templates\/[a-z0-9_]+\.hstf$/);
      expect(entry.forwardAxis).toBe("+Z");
      expect(entry.upAxis).toBe("+Y");
      expect(entry.unitScale).toBe(1);
      expect(["none", "box", "sphere", "capsule", "mesh", "trigger"]).toContain(
        entry.collisionIntent,
      );
      expect(["sharedGameplay", "localCosmetic"]).toContain(entry.replication);
      expect(["persistent", "pooled", "oneShot"]).toContain(entry.lifetime);
      expect(entry.requiredChildNames.length).toBeGreaterThan(0);
      expect(entry.childContracts.length).toBeGreaterThanOrEqual(
        entry.requiredChildNames.length,
      );
      expect(entry.childContracts.filter((child) => child.required).map((child) => child.name)).toEqual(
        entry.requiredChildNames,
      );
      for (const child of entry.childContracts) {
        expect(child.name).toMatch(/^[A-Z][A-Za-z0-9]+$/);
        expect(child.purpose.length).toBeGreaterThan(10);
      }
    }
  });

  it("documents MHS child-name contracts for animated and interactive templates", () => {
    expect(MHS_PREFAB_REGISTRY.hazard_windmill.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "WindmillBlade"]),
    );
    expect(MHS_PREFAB_REGISTRY.hazard_fan.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "FanRotor"]),
    );
    expect(MHS_PREFAB_REGISTRY.hazard_portal_gate.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "PortalEffect", "PortalTrigger"]),
    );
    expect(MHS_PREFAB_REGISTRY.coin.requiredChildNames).toContain(
      "CollectibleVisualRoot",
    );
    expect(MHS_PREFAB_REGISTRY.hazard_bumper_mushroom.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "BumperTrigger"]),
    );
    expect(MHS_PREFAB_REGISTRY.hazard_sandpit.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "SlowZoneTrigger"]),
    );
    expect(MHS_PREFAB_REGISTRY.hazard_boost.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "BoostTrigger"]),
    );
    expect(MHS_PREFAB_REGISTRY.hazard_bridge.requiredChildNames).toEqual(
      expect.arrayContaining(["VisualRoot", "SafeLaneTrigger"]),
    );
  });

  it("keeps required runtime files present on disk", () => {
    for (const entry of Object.values(MHS_PREFAB_REGISTRY)) {
      if (!entry.requiredFile) continue;
      expect(
        existsSync(join(modelRoot, entry.file)),
        `${entry.key} should resolve to ${entry.file}`,
      ).toBe(true);
    }
  });

  it("documents procgen 200x200 grass-base metadata for tile prefabs", () => {
    for (const assetKey of Object.values(PROCGEN_TILE_TO_ASSET)) {
      const entry = MHS_PREFAB_REGISTRY[assetKey];
      expect(entry.sourceGrassBase?.width).toBe(200);
      expect(entry.sourceGrassBase?.length).toBe(200);
      expect(entry.sourceGrassBase?.wallPolicy).toBe("outside-base");
    }
  });

  it("maps every hazard kind to a prefab asset key", () => {
    expect(Object.keys(HAZARD_KIND_TO_PREFAB_ASSET).sort()).toEqual(
      Object.keys(HAZARD_WEIGHT).sort(),
    );
    for (const assetKey of Object.values(HAZARD_KIND_TO_PREFAB_ASSET)) {
      expect(MHS_PREFAB_REGISTRY[assetKey]).toBeDefined();
    }
  });

  it("marks known large runtime assets as optimization red flags", () => {
    for (const key of [
      "hazard_fan",
      "coin",
      "hazard_portal_gate",
      "hazard_bumper_mushroom",
      "hazard_windmill",
      "hazard_sandpit",
    ] as const) {
      expect(MHS_PREFAB_REGISTRY[key].optimizationStatus).toBe("large-red-flag");
      expect(MHS_PREFAB_REGISTRY[key].replacementNotes).toContain("Optimize");
    }
  });

  it("keeps a planning backlog for the largest asset risks", () => {
    expect(MHS_ASSET_OPTIMIZATION_BACKLOG.map((item) => item.key)).toEqual([
      "hazard_fan",
      "coin",
      "hazard_portal_gate",
      "hazard_bumper_mushroom",
      "hazard_windmill",
      "hazard_sandpit",
      "scene_bin",
    ]);
    for (const item of MHS_ASSET_OPTIMIZATION_BACKLOG) {
      expect(item.sizeBytes).toBeGreaterThan(0);
      expect(item.recommendation.length).toBeGreaterThan(20);
    }
  });
});
