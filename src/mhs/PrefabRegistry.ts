import { ASSET_FILENAMES, type AssetKey } from "../art/AssetRegistry";
import type { HazardKind } from "../hazards/HazardTypes";

export type MhsAssetUsage = "runtime" | "web-fallback" | "debug" | "decor";

export interface MhsPrefabAsset {
  key: AssetKey;
  file: string;
  sizeBytes: number;
  mhsPrefab: string;
  futureMhsPrefabName: string;
  futureTemplatePath: string;
  usage: MhsAssetUsage;
  bundle: "runtime" | "debug" | "decor";
  debugOnly: boolean;
  requiredFile: boolean;
  portRequirement: "required" | "optional";
  pivotPolicy: "deck-center" | "visual-center" | "effect-origin" | "web-fallback";
  footprint: "tile-2x2-grass-base" | "hazard-deck" | "ball" | "collectible" | "decor" | "unknown";
  forwardAxis: "+Z";
  upAxis: "+Y";
  unitScale: 1;
  collisionIntent: "none" | "box" | "sphere" | "capsule" | "mesh" | "trigger";
  replication: "sharedGameplay" | "localCosmetic";
  lifetime: "persistent" | "pooled" | "oneShot";
  requiredChildNames: readonly string[];
  childContracts: readonly MhsPrefabChildContract[];
  sourceGrassBase?: {
    width: number;
    length: number;
    wallPolicy: "outside-base";
  };
  optimizationStatus: "needs-review" | "acceptable" | "large-red-flag";
  replacementNotes?: string;
}

export interface MhsPrefabChildContract {
  name: string;
  purpose: string;
  required: boolean;
}

const PROCGEN_TILE_BASE = {
  width: 200,
  length: 200,
  wallPolicy: "outside-base",
} as const;

const optionalWebFallbackKeys = new Set<AssetKey>([
  "tile_square",
  "tile_straight",
  "tile_curve",
  "tile_corner",
  "tile_start",
  "tile_hole",
  "hazard_bridge",
  "ball_default",
  "ball_gold",
]);

const largeRedFlags = new Set<AssetKey>([
  "hazard_fan",
  "hazard_bumper_mushroom",
  "hazard_portal_gate",
  "hazard_windmill",
  "hazard_sandpit",
  "coin",
]);

const debugKeys = new Set<AssetKey>(["tile_square", "tile_straight", "tile_curve", "tile_corner"]);
const decorKeys = new Set<AssetKey>([
  "undermap_island",
  "bg_floating_island_small",
  "bg_floating_island",
  "decor_fan_cluster",
  "decor_fantasy_crystal_rock",
  "decor_fantasy_pine_tree",
  "decor_small_flower",
  "decor_small_mushroom",
]);

const procgenTileKeys = new Set<AssetKey>([
  "tile_straight_rw",
  "tile_floor_plain",
  "tile_convex_rw",
  "tile_concave_rw",
  "tile_ramp_rw",
  "tile_ramp_lw",
  "tile_start_ph",
  "tile_hole_ph",
]);

const assetSizeBytes: Record<AssetKey, number> = {
  tile_square: 0,
  tile_straight: 0,
  tile_curve: 0,
  tile_corner: 0,
  tile_start: 0,
  tile_hole: 0,
  tile_straight_rw: 18700,
  tile_floor_plain: 18252,
  tile_convex_rw: 18748,
  tile_concave_rw: 18780,
  tile_ramp_rw: 20284,
  tile_ramp_lw: 20284,
  tile_start_ph: 18780,
  tile_hole_ph: 18780,
  hazard_windmill: 339492,
  hazard_fan: 289616,
  hazard_bridge: 0,
  hazard_bumper_mushroom: 257492,
  hazard_portal_gate: 268320,
  hazard_boost: 135500,
  hazard_sandpit: 187748,
  coin: 339292,
  ball_default: 0,
  ball_gold: 0,
  undermap_island: 190704,
  bg_floating_island_small: 224200,
  bg_floating_island: 243192,
  decor_fan_cluster: 328472,
  decor_fantasy_crystal_rock: 296632,
  decor_fantasy_pine_tree: 259652,
  decor_small_flower: 288828,
  decor_small_mushroom: 283148,
  hole_flag: 160418,
};

function usageForKey(key: AssetKey): MhsAssetUsage {
  if (debugKeys.has(key)) return "debug";
  if (decorKeys.has(key)) return "decor";
  if (optionalWebFallbackKeys.has(key)) return "web-fallback";
  return "runtime";
}

function prefabNameForKey(key: AssetKey): string {
  return `mhs/prefabs/${key}`;
}

function templatePathForKey(key: AssetKey): string {
  return `@Templates/${key}.hstf`;
}

function pivotPolicyForKey(key: AssetKey, usage: MhsAssetUsage): MhsPrefabAsset["pivotPolicy"] {
  if (procgenTileKeys.has(key)) return "deck-center";
  if (key === "coin") return "effect-origin";
  if (key === "ball_default" || key === "ball_gold") return "visual-center";
  if (usage === "web-fallback") return "web-fallback";
  return "deck-center";
}

function footprintForKey(key: AssetKey, usage: MhsAssetUsage): MhsPrefabAsset["footprint"] {
  if (procgenTileKeys.has(key)) return "tile-2x2-grass-base";
  if (key === "coin") return "collectible";
  if (key === "ball_default" || key === "ball_gold") return "ball";
  if (usage === "decor") return "decor";
  if (key.startsWith("hazard_")) return "hazard-deck";
  return "unknown";
}

function collisionIntentForKey(key: AssetKey, usage: MhsAssetUsage): MhsPrefabAsset["collisionIntent"] {
  if (usage === "debug" || usage === "decor") return "none";
  if (procgenTileKeys.has(key)) return "mesh";
  if (key === "coin") return "trigger";
  if (key === "ball_default" || key === "ball_gold") return "sphere";
  if (key.startsWith("hazard_")) return "trigger";
  return "none";
}

function replicationForKey(usage: MhsAssetUsage): MhsPrefabAsset["replication"] {
  return usage === "debug" || usage === "decor" ? "localCosmetic" : "sharedGameplay";
}

function lifetimeForKey(key: AssetKey, usage: MhsAssetUsage): MhsPrefabAsset["lifetime"] {
  if (usage === "debug" || usage === "decor") return "pooled";
  if (key === "coin") return "pooled";
  return "persistent";
}

function requiredChildNamesForKey(key: AssetKey): readonly string[] {
  return childContractsForKey(key)
    .filter((contract) => contract.required)
    .map((contract) => contract.name);
}

function childContractsForKey(key: AssetKey): readonly MhsPrefabChildContract[] {
  if (procgenTileKeys.has(key)) {
    return [
      { name: "VisualRoot", purpose: "Visible tile mesh root.", required: true },
      { name: "Collider", purpose: "Primary playable tile collision.", required: true },
      { name: "WallRoot", purpose: "Optional outside-base wall children.", required: false },
      { name: "RailRoot", purpose: "Optional rail/edge helper children.", required: false },
    ];
  }

  const contracts: Partial<Record<AssetKey, readonly MhsPrefabChildContract[]>> = {
    ball_default: [
      { name: "BallVisualRoot", purpose: "Skinnable ball visual root.", required: true },
      { name: "BallCollider", purpose: "Sphere collision root.", required: true },
      { name: "TrailAnchor", purpose: "Optional local cosmetic trail anchor.", required: false },
    ],
    ball_gold: [
      { name: "BallVisualRoot", purpose: "Skinnable ball visual root.", required: true },
      { name: "BallCollider", purpose: "Sphere collision root.", required: true },
      { name: "TrailAnchor", purpose: "Optional local cosmetic trail anchor.", required: false },
    ],
    coin: [
      { name: "CollectibleVisualRoot", purpose: "Coin visual root.", required: true },
      { name: "CollectibleTrigger", purpose: "Pickup trigger volume.", required: true },
      { name: "PickupVfxAnchor", purpose: "Optional pickup burst anchor.", required: false },
    ],
    hazard_windmill: [
      { name: "VisualRoot", purpose: "Windmill static visual root.", required: true },
      { name: "Collider", purpose: "Blocking collision root.", required: true },
      { name: "WindmillBlade", purpose: "Animated blade/rotor child.", required: true },
      { name: "BladePivot", purpose: "Optional explicit blade pivot.", required: false },
      { name: "AudioAnchor", purpose: "Optional looping/hit audio anchor.", required: false },
    ],
    hazard_fan: [
      { name: "VisualRoot", purpose: "Fan static visual root.", required: true },
      { name: "FanRotor", purpose: "Animated fan rotor child.", required: true },
      { name: "FanTrigger", purpose: "Fan push trigger volume.", required: true },
      { name: "WindVfxAnchor", purpose: "Optional local wind VFX anchor.", required: false },
      { name: "AudioAnchor", purpose: "Optional fan audio anchor.", required: false },
    ],
    hazard_portal_gate: [
      { name: "VisualRoot", purpose: "Portal frame visual root.", required: true },
      { name: "PortalTrigger", purpose: "Teleport/finish trigger volume.", required: true },
      { name: "PortalEffect", purpose: "Portal swirl/effect child.", required: true },
      { name: "ExitAnchor", purpose: "Optional explicit paired exit anchor.", required: false },
      { name: "AudioAnchor", purpose: "Optional portal audio anchor.", required: false },
    ],
    hazard_bumper_mushroom: [
      { name: "VisualRoot", purpose: "Bumper visual root.", required: true },
      { name: "BumperTrigger", purpose: "Bounce trigger volume.", required: true },
      { name: "HitVfxAnchor", purpose: "Optional bounce VFX anchor.", required: false },
      { name: "AudioAnchor", purpose: "Optional bounce audio anchor.", required: false },
    ],
    hazard_sandpit: [
      { name: "VisualRoot", purpose: "Sandpit visual root.", required: true },
      { name: "SlowZoneTrigger", purpose: "Slow/friction trigger volume.", required: true },
    ],
    hazard_boost: [
      { name: "VisualRoot", purpose: "Boost pad visual root.", required: true },
      { name: "BoostTrigger", purpose: "Acceleration trigger volume.", required: true },
      { name: "DirectionArrow", purpose: "Optional boost direction visual.", required: false },
    ],
    hazard_bridge: [
      { name: "VisualRoot", purpose: "Bridge visual root.", required: true },
      { name: "SafeLaneTrigger", purpose: "Narrow safe-lane trigger.", required: true },
      { name: "VoidZone", purpose: "Optional bridge-side OOB trigger.", required: false },
    ],
  };
  return contracts[key] ?? [
    { name: "VisualRoot", purpose: "Prefab visual root.", required: true },
  ];
}

function bundleForUsage(usage: MhsAssetUsage): MhsPrefabAsset["bundle"] {
  if (usage === "debug") return "debug";
  if (usage === "decor") return "decor";
  return "runtime";
}

function replacementNotesForKey(key: AssetKey): string | undefined {
  if (largeRedFlags.has(key)) {
    return "Optimize before MHS packaging; consider mesh compression, LOD, or lower-detail prefab.";
  }
  if (optionalWebFallbackKeys.has(key)) {
    return "Optional web fallback; do not require in MHS runtime unless promoted to a prefab.";
  }
  return undefined;
}

export const MHS_PREFAB_REGISTRY: Record<AssetKey, MhsPrefabAsset> = Object.fromEntries(
  (Object.keys(ASSET_FILENAMES) as AssetKey[]).map((key) => [
    key,
    {
      key,
      file: ASSET_FILENAMES[key],
      sizeBytes: assetSizeBytes[key],
      mhsPrefab: prefabNameForKey(key),
      futureMhsPrefabName: prefabNameForKey(key),
      futureTemplatePath: templatePathForKey(key),
      usage: usageForKey(key),
      bundle: bundleForUsage(usageForKey(key)),
      debugOnly: usageForKey(key) === "debug",
      requiredFile: !optionalWebFallbackKeys.has(key),
      portRequirement: optionalWebFallbackKeys.has(key) ? "optional" : "required",
      pivotPolicy: pivotPolicyForKey(key, usageForKey(key)),
      footprint: footprintForKey(key, usageForKey(key)),
      forwardAxis: "+Z",
      upAxis: "+Y",
      unitScale: 1,
      collisionIntent: collisionIntentForKey(key, usageForKey(key)),
      replication: replicationForKey(usageForKey(key)),
      lifetime: lifetimeForKey(key, usageForKey(key)),
      requiredChildNames: requiredChildNamesForKey(key),
      childContracts: childContractsForKey(key),
      ...(procgenTileKeys.has(key) ? { sourceGrassBase: PROCGEN_TILE_BASE } : {}),
      optimizationStatus: largeRedFlags.has(key)
        ? "large-red-flag"
        : decorKeys.has(key)
          ? "needs-review"
          : "acceptable",
      ...(replacementNotesForKey(key)
        ? { replacementNotes: replacementNotesForKey(key) }
        : {}),
    } satisfies MhsPrefabAsset,
  ]),
) as Record<AssetKey, MhsPrefabAsset>;

export const HAZARD_KIND_TO_PREFAB_ASSET: Record<HazardKind, AssetKey> = {
  windmill: "hazard_windmill",
  sandpit: "hazard_sandpit",
  fan: "hazard_fan",
  bridge: "hazard_bridge",
  boost: "hazard_boost",
  bumper_mushroom: "hazard_bumper_mushroom",
  portal_gate: "hazard_portal_gate",
};

export interface MhsAssetOptimizationBacklogItem {
  key: AssetKey | "scene_bin";
  file: string;
  sizeBytes: number;
  priority: "P1" | "P2";
  recommendation: string;
}

export const MHS_ASSET_OPTIMIZATION_BACKLOG: readonly MhsAssetOptimizationBacklogItem[] = [
  {
    key: "hazard_fan",
    file: "fan.glb",
    sizeBytes: assetSizeBytes.hazard_fan,
    priority: "P1",
    recommendation: "Texture compressed to 1024px; visually review in-game before clearing red-flag status.",
  },
  {
    key: "coin",
    file: "collectible_crown_coin.glb",
    sizeBytes: assetSizeBytes.coin,
    priority: "P1",
    recommendation: "Texture compressed to 1024px; consider simpler collectible prefab if still too heavy in MHS.",
  },
  {
    key: "hazard_portal_gate",
    file: "hazard_portal_gate.glb",
    sizeBytes: assetSizeBytes.hazard_portal_gate,
    priority: "P1",
    recommendation: "Texture compressed to 1024px; split visual ring/effects from collision trigger in MHS.",
  },
  {
    key: "hazard_bumper_mushroom",
    file: "hazard_bumper_mushroom.glb",
    sizeBytes: assetSizeBytes.hazard_bumper_mushroom,
    priority: "P1",
    recommendation: "Texture compressed to 1024px; share mushroom materials with decor if MHS package grows.",
  },
  {
    key: "hazard_windmill",
    file: "windmill.glb",
    sizeBytes: assetSizeBytes.hazard_windmill,
    priority: "P1",
    recommendation: "Texture compressed to 1024px; replace mesh traversal with explicit animated prefab child references.",
  },
  {
    key: "hazard_sandpit",
    file: "hazard_sandpit.glb",
    sizeBytes: assetSizeBytes.hazard_sandpit,
    priority: "P2",
    recommendation: "Texture compressed to 1024px; separate static visual from slow-zone trigger.",
  },
  {
    key: "scene_bin",
    file: "scene.bin",
    sizeBytes: 1801044,
    priority: "P2",
    recommendation: "Confirm ownership/reference path; remove from MHS package if orphaned.",
  },
];
