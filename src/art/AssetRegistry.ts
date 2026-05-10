import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { publicUrl } from "../core/publicPath";

const DEFAULT_MODELS_BASE = publicUrl("assets/models/");

/**
 * Central registry for optional GLB/GLTF meshes. Gameplay never depends on assets loading.
 *
 * ─── Where to put files (Vite `public/` → served at site root) ─────────────────
 *
 *   public/assets/models/<filename>.glb
 *
 * Example full URL at dev:  http://localhost:5173/assets/models/tile_straight.glb
 *
 * Use `.glb` (binary) or `.gltf` — update the extension in {@link ASSET_FILENAMES} if you use `.gltf`.
 *
 * **flag.gltf (hole_flag):** Sketchfab-style exports reference `scene.bin` in the same folder.
 * Without `scene.bin` next to `flag.gltf`, the load fails and the procedural hole flag is used.
 *
 * Missing files: load fails silently except `console.warn`; {@link getModelClone} returns `null`.
 *
 * **Embedded FBX textures:** there is no in-repo batch step to resize/compress textures inside FBX;
 * bake smaller maps in your DCC (or use gltf-transform / Blender) before copying into `public/`.
 *
 * **Hazard FBX naming:** windmill rotating pieces should be named `windmillArm`, `windmill_arm`, `windmillArm2`, or
 * `windmillArm.001`-style (underscores/dots are normalized); fan rotors should match `fanArm` / `fan_blade` /
 * `fanRotor` prefixes (see `implementations.ts`). If names are missing, a sibling heuristic picks likely rotor geometry.
 *
 * **Procgen tiles:** FBX keys try `.fbx` first, then the same basename with `.glb`.
 * Artist sources may live in repo `/Tiles/` — deploy copies under `public/assets/models/`
 * using names from {@link ASSET_FILENAMES} (e.g. `tile_straight_rw.fbx`).
 */

export const ASSET_FILENAMES = {
  tile_square: "tile_square.glb",
  tile_straight: "tile_straight.glb",
  tile_curve: "tile_curve.glb",
  tile_corner: "tile_corner.glb",
  tile_start: "tile_start.glb",
  tile_hole: "tile_hole.glb",
  /** Procgen catalog — place matching `.fbx` (or `.glb`) under `public/assets/models/` */
  tile_straight_rw: "tile_straight_rw.fbx",
  tile_floor_plain: "tile_floor_plain.fbx",
  tile_convex_rw: "tile_convex_rw.fbx",
  tile_concave_rw: "tile_concave_rw.fbx",
  tile_ramp_rw: "tile_ramp_rw.fbx",
  tile_ramp_lw: "tile_ramp_lw.fbx",
  tile_start_ph: "tile_start_ph.fbx",
  tile_hole_ph: "tile_hole_ph.fbx",
  hazard_windmill: "hazard_windmill.fbx",
  hazard_fan: "hazard_fan.fbx",
  /** Placeholder until art ships — try `.fbx` then `.glb` */
  hazard_bridge: "hazard_bridge.fbx",
  /** Bumpers — falls back to procedural mesh if missing */
  hazard_bumper_mushroom: "hazard_bumper_mushroom.glb",
  /** Portal frame — falls back to procedural ring if missing */
  hazard_portal_gate: "hazard_portal_gate.glb",
  /** Speed strip — falls back to procedural pad if missing */
  hazard_boost: "hazard_boost.fbx",
  /** Sand trap mesh — falls back to procedural sand if missing */
  hazard_sandpit: "hazard_sandpit.fbx",
  coin: "coin.glb",
  ball_default: "ball_default.glb",
  ball_gold: "ball_gold.glb",
  /** Large flat-topped mass placed under the course for a grounded read */
  undermap_island: "medium-floating-island.glb",
  /** Distant vista — sparse placement (see `backgroundFloatingIslands.ts`) */
  bg_floating_island_small: "small-floating-island.glb",
  bg_floating_island: "floating-island.glb",
  decor_fan_cluster: "fan-cluster.glb",
  decor_fantasy_crystal_rock: "fantasy-crystal-rock.glb",
  decor_fantasy_pine_tree: "fantasy-pine-tree.glb",
  decor_small_flower: "small-decorative-flower.glb",
  decor_small_mushroom: "small-fantasy-mushroom.glb",
  hole_flag: "flag.gltf",
} as const;

export type AssetKey = keyof typeof ASSET_FILENAMES;

/** Mutable cache: undefined = not attempted yet; null = load failed / no file */
type CacheEntry = THREE.Object3D | null | undefined;

const ALL_KEYS = Object.keys(ASSET_FILENAMES) as AssetKey[];

export class AssetRegistry {
  private readonly gltfLoader = new GLTFLoader();
  private readonly fbxLoader = new FBXLoader();
  private readonly cache = new Map<AssetKey, CacheEntry>();
  private readonly animationClips = new Map<AssetKey, THREE.AnimationClip[]>();
  private readonly loadPromises = new Map<AssetKey, Promise<void>>();

  /**
   * Deep-clone of the cached template for this key, or `null` if unavailable / still loading.
   * Safe to call every frame.
   */
  getModelClone(key: AssetKey): THREE.Object3D | null {
    const entry = this.cache.get(key);
    if (entry === undefined || entry === null) return null;
    return entry.clone(true);
  }

  /** True once we know a file loaded successfully */
  isReady(key: AssetKey): boolean {
    const e = this.cache.get(key);
    return e !== undefined && e !== null;
  }

  /** Clips from the last successful GLTF load (empty if none or failed). */
  getAnimationClips(key: AssetKey): readonly THREE.AnimationClip[] {
    return this.animationClips.get(key) ?? [];
  }

  /**
   * Wait until this asset has finished loading (success or failure).
   * Safe to call many times; concurrent callers share one promise.
   */
  preloadAsset(key: AssetKey, basePath = DEFAULT_MODELS_BASE): Promise<void> {
    if (this.cache.has(key)) return Promise.resolve();
    let p = this.loadPromises.get(key);
    if (!p) {
      p = this.loadOne(key, basePath).finally(() => {
        this.loadPromises.delete(key);
      });
      this.loadPromises.set(key, p);
    }
    return p;
  }

  /**
   * Fire-and-forget: loads all known assets in the background. Safe to call once at boot.
   * Never throws; failures store `null` in cache.
   */
  startBackgroundPreload(basePath = DEFAULT_MODELS_BASE): void {
    for (const k of ALL_KEYS) {
      void this.preloadAsset(k, basePath);
    }
  }

  private async loadOne(key: AssetKey, basePath: string): Promise<void> {
    const base = basePath.replace(/\/?$/, "/");

    const applyGltf = (gltf: {
      scene: THREE.Object3D;
      animations: readonly THREE.AnimationClip[];
    }) => {
      const root = gltf.scene;
      root.name = `asset_${key}`;
      this.cache.set(key, root);
      this.animationClips.set(key, [...gltf.animations]);
    };

    if (key === "hole_flag") {
      const candidates = ["flag.glb", ASSET_FILENAMES.hole_flag];
      for (const file of candidates) {
        const url = `${base}${file}`;
        try {
          const gltf = await this.gltfLoader.loadAsync(url);
          applyGltf(gltf);
          return;
        } catch (err) {
          console.warn(`[AssetRegistry] hole_flag failed: ${url}`, err);
        }
      }
      this.cache.set(key, null);
      this.animationClips.set(key, []);
      console.warn(
        "[AssetRegistry] hole_flag: place `flag.glb` (single-file) or `flag.gltf` + `scene.bin` in public/assets/models/",
      );
      return;
    }

    const file = ASSET_FILENAMES[key];
    const urlsToTry =
      file.endsWith(".fbx")
        ? [
            `${base}${file}`,
            `${base}${file.replace(/\.fbx$/i, ".glb")}`,
          ]
        : [`${base}${file}`];

    let lastErr: unknown;
    for (const url of urlsToTry) {
      try {
        if (url.endsWith(".fbx")) {
          const root = await this.fbxLoader.loadAsync(url);
          root.name = `asset_${key}`;
          this.cache.set(key, root);
          this.animationClips.set(key, []);
          return;
        }
        const gltf = await this.gltfLoader.loadAsync(url);
        applyGltf(gltf);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    console.warn(
      `[AssetRegistry] Failed to load ${key} (tried: ${urlsToTry.join(", ")})`,
      lastErr,
    );
    this.cache.set(key, null);
    this.animationClips.set(key, []);
  }
}

/** Singleton — import this from TileKit / hazards / Ball; swap in tests by constructing another registry only if you refactor injection later */
export const assetRegistry = new AssetRegistry();
