import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { assetRegistry } from "../art/AssetRegistry";
import {
  PSX_LOW_RES_INTERNAL_SCALE,
  SKY_BLUE,
} from "../core/Constants";
import { PsxLowResPresenter } from "../core/PsxLowResPresenter";
import { createHazardInstances } from "../hazards/implementations";
import type { HazardInstance } from "../hazards/Hazard";
import { FantasyVoidLayer } from "../level/fantasyVoid";
import type { GeneratedLevel, LevelWorldBounds } from "../level/LevelTypes";
import { createIslandSurroundDecor } from "../level/islandDecorScatter";
import { resolveProcgenUndermapPlacement } from "../level/resolveProcgenUndermapIslandSlots";
import { buildUndermapIslandGroup } from "../level/undermapIslands";
import { adaptProcgenMapToGeneratedLevel } from "../level/procgenLevelAdapter";
import { buildTileGroup } from "../level/tiles/TileKit";
import {
  createDebugEndpointLabels,
  createDebugPlaceholderGroup,
} from "./DebugMapRenderer";
import { mapGenerationEndpoint } from "./MapGenerationEndpoint";
import type { GeneratedMap } from "./MapGenerationTypes";
import type { TileType } from "./MapGenerationTypes";
import {
  createProcgenDebugRequest,
  normalizeProcgenDebugDifficulty,
} from "./procgenDebugRequest";
import {
  getTileDefinition,
  RAMP_HEIGHT,
  TILE_LENGTH,
} from "./TileCatalog";
import { PROCGEN_TILE_TO_ASSET } from "./procgenAssetKeys";
import {
  alignProcgenModelGrassBaseToDeckOrigin,
  scaleProcgenModelGrassBaseToWorldUnits,
  snapRampExitFloorToHeight,
  resetProcgenAssetInstanceRoot,
} from "./procgenModelScale";
import {
  createSocketDebugGroup,
  createSocketDebugGroupForPlacedTile,
} from "./SocketDebugHelpers";

const SINGLE_KEYS: TileType[] = [
  "straight_right_wall",
  "convex_right_wall",
  "concave_right_wall",
  "ramp_right_wall",
  "ramp_left_wall",
];

export interface ProcgenDebugViewerOptions {
  onMapGenerated?: (map: GeneratedMap) => void;
  /**
   * Current difficulty from toolbar (1–20). Used when **G** is pressed or when
   * {@link generateMapFromUi} omits `targetDifficulty`, so generation matches the UI.
   */
  getTargetDifficulty?: () => number;
  /** PSX low-res RT + upscale path (see {@link PSX_LOW_RES_INTERNAL_SCALE} in Constants). */
  initialPsxLowRes?: boolean;
}

function createDebugSeed(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function makeModelDoubleSided(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function cloneTileModel(type: TileType): THREE.Object3D | null {
  const key = PROCGEN_TILE_TO_ASSET[type];
  if (!key) return null;
  const node = assetRegistry.getModelClone(key);
  if (node) {
    resetProcgenAssetInstanceRoot(node);
    scaleProcgenModelGrassBaseToWorldUnits(node);
    alignProcgenModelGrassBaseToDeckOrigin(node, 0);
    // For ramps: translate in Y so the exit floor (measured via vertex sampling at the
    // high-Z end) is exactly RAMP_HEIGHT — closes the vertical seam between ramp exit
    // and the next flat tile without deforming the model geometry.
    if (type === "ramp_right_wall" || type === "ramp_left_wall") {
      snapRampExitFloorToHeight(node, RAMP_HEIGHT);
    }
    if (key === "tile_floor_plain") {
      makeModelDoubleSided(node);
    }
  }
  return node;
}

function buildDebugDeck(color = 0x126f12): THREE.Mesh {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_LENGTH, 0.14, TILE_LENGTH),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0,
    }),
  );
  deck.position.y = -0.07;
  return deck;
}

function buildDebugFloorBacking(): THREE.Mesh {
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_LENGTH, 0.04, TILE_LENGTH),
    new THREE.MeshStandardMaterial({
      color: 0x235a2b,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  deck.position.y = -0.08;
  deck.renderOrder = -1;
  return deck;
}

function buildDebugWallAlongZ(x: number): THREE.Mesh {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 1.1, TILE_LENGTH),
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.72,
      metalness: 0,
    }),
  );
  wall.position.set(x, 0.48, 0);
  return wall;
}

function buildDebugWallAlongX(z: number): THREE.Mesh {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_LENGTH, 1.1, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.72,
      metalness: 0,
    }),
  );
  wall.position.set(0, 0.48, z);
  return wall;
}

function buildProcgenDebugFallback(type: TileType): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `procgen_debug_fallback_${type}`;
  g.add(buildDebugDeck(type === "floor_plain" ? 0x56c96a : 0x126f12));

  if (type === "straight_right_wall") {
    g.add(buildDebugWallAlongZ(TILE_LENGTH / 2));
  } else if (
    type === "convex_right_wall" ||
    type === "concave_right_wall" ||
    type === "start_placeholder" ||
    type === "hole_placeholder" ||
    type === "dead_end_cap"
  ) {
    // The current corner source art has walls on local +X and local -Z.
    g.add(buildDebugWallAlongZ(TILE_LENGTH / 2));
    g.add(buildDebugWallAlongX(-TILE_LENGTH / 2));
  }

  return g;
}

function buildTileVisual(type: TileType): THREE.Object3D {
  if (type === "floor_plain") {
    const g = new THREE.Group();
    g.name = "procgen_debug_floor_plain";
    g.add(buildDebugFloorBacking());
    const node = cloneTileModel(type);
    if (node) {
      node.name = `procgen_debug_art_${type}`;
      g.add(node);
    } else {
      g.add(buildDebugDeck(0x56c96a));
    }
    return g;
  }
  const node = cloneTileModel(type);
  if (node) {
    node.name = `procgen_debug_art_${type}`;
    return node;
  }
  return buildProcgenDebugFallback(type);
}

/**
 * Dev-only scene: verify procgen pivots/sockets and tile continuity.
 * Not loaded by normal gameplay — see `?procgenDebug=1` on the URL.
 */
export class ProcgenDebugViewer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly mainGroup = new THREE.Group();
  /** Tile meshes only — stays visible in {@link setMapOnlyScene} mode */
  private readonly mapTilesGroup = new THREE.Group();
  /** Procgen placeholders + endpoint text — hidden in map-only */
  private readonly debugOverlaysGroup = new THREE.Group();
  /** Hazards / obstacles / portals — stays visible in game-like {@link setMapOnlyScene} mode */
  private readonly hazardDebugGroup = new THREE.Group();
  private readonly socketOverlay = new THREE.Group();
  private socketHelpersVisible = true;
  /** When true: hide procgen-only overlays (placeholders, labels) and sockets — tiles + hazards like gameplay. */
  private mapOnlyScene = false;
  private mode: "single" | "map" = "single";
  private singleTileType: TileType = "straight_right_wall";
  private currentMap: GeneratedMap | null = null;
  private hazardDebugInstances: HazardInstance[] = [];
  private hazardAnimPrevMs = performance.now();
  private raf = 0;
  /** Map debug = {@link SKY_BLUE}; game view = slightly darker solid clear + cloud ring (no water plane). */
  private readonly skyClearMapDebug = new THREE.Color(SKY_BLUE);
  private readonly skyClearGameView = new THREE.Color(SKY_BLUE).multiplyScalar(
    0.82,
  );
  private fantasyVoidLayer: FantasyVoidLayer | null = null;
  /** Medium floating islands under 2×2 deck blocks — procgen debug only (see {@link computeProcgenUndermapQuadSlots}). */
  private procgenUndermapGroup: THREE.Group | null = null;
  /** Same island décor scatter as gameplay — procgen map mode only. */
  private procgenIslandDecorGroup: THREE.Group | null = null;
  private psxLowResEnabled = false;
  private psxPresenter: PsxLowResPresenter | null = null;
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const k = e.key;
    const code = e.code;
    if (k === "s" || k === "S") {
      this.toggleSockets();
      e.preventDefault();
      return;
    }
    if (k === "g" || k === "G") {
      this.showGeneratedMap(undefined, undefined);
      e.preventDefault();
      return;
    }
    const digit =
      k >= "1" && k <= "5"
        ? parseInt(k, 10)
        : code.startsWith("Digit") && code.length === 6
          ? parseInt(code.slice(5), 10)
          : NaN;
    if (digit >= 1 && digit <= 5) {
      this.showSingleTile(SINGLE_KEYS[digit - 1]);
      e.preventDefault();
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ProcgenDebugViewerOptions = {},
  ) {
    this.psxLowResEnabled = Boolean(options.initialPsxLowRes);
    const aspect =
      canvas.clientWidth / Math.max(1, canvas.clientHeight) ||
      window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 600);
    this.camera.position.set(14, 16, 18);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (this.psxLowResEnabled) {
      this.psxPresenter = new PsxLowResPresenter(
        this.renderer,
        PSX_LOW_RES_INTERNAL_SCALE,
      );
    }

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 6);
    this.controls.update();

    this.scene.background = this.skyClearMapDebug;
    const amb = new THREE.AmbientLight(0xfff5e8, 0.55);
    const dir = new THREE.DirectionalLight(0xfff0dd, 1.2);
    dir.position.set(8, 22, 12);
    this.scene.add(amb, dir);
    this.mapTilesGroup.name = "ProcgenDebugMapTiles";
    this.debugOverlaysGroup.name = "ProcgenDebugOverlays";
    this.hazardDebugGroup.name = "ProcgenDebugHazards";
    this.mainGroup.add(this.mapTilesGroup);
    this.mainGroup.add(this.debugOverlaysGroup);
    this.mainGroup.add(this.hazardDebugGroup);
    this.scene.add(this.mainGroup);
    this.scene.add(this.socketOverlay);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.canvas.tabIndex = 0;
    void this.canvas.focus();
    this.resizeRenderer();
    this.hazardAnimPrevMs = performance.now();
    this.showSingleTile(this.singleTileType);
    this.tick();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    this.disposeFantasyVoid();
    this.disposeProcgenIslandDecor();
    this.disposeProcgenUndermap();
    this.psxPresenter?.dispose();
    this.psxPresenter = null;
    this.controls.dispose();
    this.renderer.dispose();
  }

  private onResize = (): void => {
    this.resizeRenderer();
  };

  private resizeRenderer(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Public API for toolbar / tests — same as pressing S. */
  toggleSocketHelpersFromUi(): void {
    this.toggleSockets();
  }

  /**
   * Game-like preview: hide procgen-only overlays (placeholders, endpoint labels) and socket helpers.
   * Tile meshes and hazards (bumpers, portals, etc.) stay visible.
   * DOM chrome is toggled by the procgen bootstrap toolbar.
   */
  setMapOnlyScene(enabled: boolean): void {
    this.mapOnlyScene = enabled;
    this.applyMapOnlyVisibility();
  }

  getMapOnlyScene(): boolean {
    return this.mapOnlyScene;
  }

  private applyMapOnlyVisibility(): void {
    const only = this.mapOnlyScene;
    this.debugOverlaysGroup.visible = !only;
    this.socketOverlay.visible = !only && this.socketHelpersVisible;
    this.syncGameViewSky();
  }

  /** Game view: darker clear + {@link FantasyVoidLayer} clouds only (no translucent water plane). */
  private syncGameViewSky(): void {
    this.scene.background = this.mapOnlyScene
      ? this.skyClearGameView
      : this.skyClearMapDebug;
    if (!this.mapOnlyScene) {
      this.disposeFantasyVoid();
      return;
    }
    this.disposeFantasyVoid();
    this.fantasyVoidLayer = new FantasyVoidLayer(
      this.boundsForGameViewBackdrop(),
      { includeWaterPlane: false },
    );
    this.scene.add(this.fantasyVoidLayer);
  }

  private boundsForGameViewBackdrop(): LevelWorldBounds {
    if (this.mode === "map" && this.currentMap) {
      const b = this.currentMap.cameraBounds;
      return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
    }
    const pad = TILE_LENGTH * 2;
    return { minX: -pad, maxX: pad, minZ: -pad, maxZ: pad * 2 };
  }

  private disposeFantasyVoid(): void {
    if (!this.fantasyVoidLayer) return;
    this.scene.remove(this.fantasyVoidLayer);
    this.disposeObject3D(this.fantasyVoidLayer);
    this.fantasyVoidLayer = null;
  }

  private disposeProcgenUndermap(): void {
    if (!this.procgenUndermapGroup) return;
    this.scene.remove(this.procgenUndermapGroup);
    this.disposeObject3D(this.procgenUndermapGroup);
    this.procgenUndermapGroup = null;
  }

  private disposeProcgenIslandDecor(): void {
    if (!this.procgenIslandDecorGroup) return;
    this.scene.remove(this.procgenIslandDecorGroup);
    this.disposeObject3D(this.procgenIslandDecorGroup);
    this.procgenIslandDecorGroup = null;
  }

  setPsxLowResEnabled(enabled: boolean): void {
    if (enabled === this.psxLowResEnabled) return;
    this.psxLowResEnabled = enabled;
    if (enabled) {
      if (!this.psxPresenter) {
        this.psxPresenter = new PsxLowResPresenter(
          this.renderer,
          PSX_LOW_RES_INTERNAL_SCALE,
        );
      }
    } else {
      this.psxPresenter?.dispose();
      this.psxPresenter = null;
    }
  }

  getPsxLowResEnabled(): boolean {
    return this.psxLowResEnabled;
  }

  /** Public API — same as pressing G. If `targetDifficulty` is omitted, uses {@link ProcgenDebugViewerOptions.getTargetDifficulty} or 6. */
  generateMapFromUi(seed?: string, targetDifficulty?: number): string {
    return this.showGeneratedMap(seed, targetDifficulty);
  }

  /** Public API — same as pressing 1..5. */
  showPresetTile(index1To5: 1 | 2 | 3 | 4 | 5): void {
    this.showSingleTile(SINGLE_KEYS[index1To5 - 1]);
  }

  private toggleSockets(): void {
    this.socketHelpersVisible = !this.socketHelpersVisible;
    this.socketOverlay.visible =
      !this.mapOnlyScene && this.socketHelpersVisible;
  }

  private disposeHazardDebug(): void {
    for (const h of this.hazardDebugInstances) {
      h.group.removeFromParent();
      h.dispose();
    }
    this.hazardDebugInstances = [];
  }

  private clearGroups(): void {
    this.disposeProcgenIslandDecor();
    this.disposeProcgenUndermap();
    this.disposeHazardDebug();
    this.disposeGroupContents(this.mapTilesGroup);
    this.disposeGroupContents(this.debugOverlaysGroup);
    this.disposeGroupContents(this.hazardDebugGroup);
    this.disposeGroupContents(this.socketOverlay);
  }

  private disposeGroupContents(g: THREE.Group): void {
    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      this.disposeObject3D(c);
    }
  }

  private disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else (mat as THREE.Material | undefined)?.dispose();
      }
    });
  }

  private rebuildSocketHelpers(): void {
    this.disposeGroupContents(this.socketOverlay);
    if (!this.socketHelpersVisible || this.mapOnlyScene) {
      this.socketOverlay.visible = false;
      return;
    }
    this.socketOverlay.visible = true;

    if (this.mode === "single") {
      const def = getTileDefinition(this.singleTileType);
      const pivot = new THREE.Vector3(0, 0, 0);
      const rotationY = 0;
      this.socketOverlay.add(createSocketDebugGroup(def, pivot, rotationY));
      return;
    }

    if (this.currentMap) {
      for (const t of this.currentMap.tiles) {
        this.socketOverlay.add(createSocketDebugGroupForPlacedTile(t));
      }
    }
  }

  private showSingleTile(type: TileType): void {
    this.mode = "single";
    this.singleTileType = type;
    this.currentMap = null;
    this.clearGroups();

    const meshRoot = buildTileVisual(type);
    meshRoot.position.set(0, 0, 0);
    meshRoot.rotation.y = 0;
    this.mapTilesGroup.add(meshRoot);

    this.rebuildSocketHelpers();
    this.applyMapOnlyVisibility();
  }

  private resolveDebugDifficulty(explicit?: number): number {
    if (explicit !== undefined && Number.isFinite(explicit)) {
      return normalizeProcgenDebugDifficulty(explicit);
    }
    const fromUi = this.options.getTargetDifficulty?.();
    if (fromUi !== undefined && Number.isFinite(fromUi)) {
      return normalizeProcgenDebugDifficulty(fromUi);
    }
    return normalizeProcgenDebugDifficulty(undefined);
  }

  private showGeneratedMap(seed?: string, targetDifficulty?: number): string {
    const td = this.resolveDebugDifficulty(targetDifficulty);
    const s = seed ?? createDebugSeed();
    const map = mapGenerationEndpoint.generateMap(createProcgenDebugRequest(s, td));

    this.mode = "map";
    this.currentMap = map;
    this.options.onMapGenerated?.(map);
    this.clearGroups();

    let adapted: GeneratedLevel | null = null;
    const adaptBase = {
      levelIndex: td,
      targetDifficultyRounded: td,
      rng: () => Math.random(),
    };
    try {
      adapted = adaptProcgenMapToGeneratedLevel(map, adaptBase);
    } catch (err) {
      console.warn(
        "[ProcgenDebugViewer] level adapt failed — retrying without strict validation (decor / path islands):",
        err,
      );
      try {
        adapted = adaptProcgenMapToGeneratedLevel(map, {
          ...adaptBase,
          skipGameplayValidation: true,
        });
      } catch (err2) {
        console.warn("[ProcgenDebugViewer] adapt retry failed:", err2);
      }
    }

    const placeholders = createDebugPlaceholderGroup(map, adapted?.hazardSpecs);
    this.debugOverlaysGroup.add(placeholders);
    this.debugOverlaysGroup.add(createDebugEndpointLabels(map));

    // Full-map tiles: use the same {@link buildTileGroup} + worldX/Z contract as {@link LevelBuilder}
    // so meshes match overlays (authoritative deck centers) and hazards. The old clone-only path
    // duplicated scaling/pivot steps and drifted from TileKit.
    if (adapted) {
      for (const gt of adapted.tiles) {
        const piece = buildTileGroup(gt);
        piece.position.set(gt.worldX, gt.worldY ?? 0, gt.worldZ);
        piece.rotation.y = gt.rotationY;
        piece.name = `procgen_debug_piece_${gt.type}_${gt.gridX}_${gt.gridZ}`;
        this.mapTilesGroup.add(piece);
      }
    } else {
      for (const t of map.tiles) {
        const deck = t.deckPosition;
        const art = buildTileVisual(t.tileType);
        const piece = new THREE.Group();
        piece.position.set(deck.x, deck.y, deck.z);
        piece.rotation.y = t.rotationY;
        art.name = `procgen_debug_art_${t.tileType}_${t.id}`;
        piece.add(art);
        this.mapTilesGroup.add(piece);
      }
    }

    if (adapted) {
      try {
        this.hazardDebugInstances = createHazardInstances(
          adapted.hazardSpecs,
          adapted.tiles,
        );
        for (const h of this.hazardDebugInstances) {
          this.hazardDebugGroup.add(h.group);
        }
      } catch (err) {
        console.warn("[ProcgenDebugViewer] hazard instances failed:", err);
      }
    }

    const { undermapSlots, usedQuadUndermap } =
      resolveProcgenUndermapPlacement(map, adapted);

    if (undermapSlots.length > 0) {
      this.procgenUndermapGroup = buildUndermapIslandGroup(undermapSlots);
      this.procgenUndermapGroup.name = usedQuadUndermap
        ? "ProcgenDebugUndermapQuads"
        : "ProcgenDebugUndermapPath";
      this.scene.add(this.procgenUndermapGroup);
    }

    if (adapted) {
      const islandsOnlyDecor = undermapSlots.length > 0;
      this.procgenIslandDecorGroup = createIslandSurroundDecor(
        adapted,
        undermapSlots,
        islandsOnlyDecor ? { islandsOnly: true } : undefined,
      );
      this.procgenIslandDecorGroup.name = "ProcgenDebugIslandDecor";
      this.scene.add(this.procgenIslandDecorGroup);
    }

    const cx =
      (map.cameraBounds.min.x + map.cameraBounds.max.x) / 2;
    const cz =
      (map.cameraBounds.min.z + map.cameraBounds.max.z) / 2;
    this.controls.target.set(cx, 0, cz);
    const span = Math.max(
      24,
      map.cameraBounds.max.x - map.cameraBounds.min.x,
      map.cameraBounds.max.z - map.cameraBounds.min.z,
    );
    this.camera.position.set(cx + span * 0.85, span * 0.95, cz + span * 0.85);
    this.controls.update();

    this.rebuildSocketHelpers();
    this.applyMapOnlyVisibility();
    return s;
  }

  private tick = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.hazardAnimPrevMs) / 1000);
    this.hazardAnimPrevMs = now;
    for (const h of this.hazardDebugInstances) {
      h.update(dt);
    }
    this.fantasyVoidLayer?.update(dt);
    this.controls.update();
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    if (this.psxPresenter) {
      const clear =
        this.scene.background instanceof THREE.Color
          ? this.scene.background
          : SKY_BLUE;
      this.psxPresenter.render(this.renderer, this.scene, this.camera, clear, {
        x: 0,
        y: 0,
        width: w,
        height: h,
      });
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
