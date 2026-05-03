import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { assetRegistry } from "../art/AssetRegistry";
import { SKY_BLUE } from "../core/Constants";
import {
  createDebugEndpointLabels,
  createDebugPlaceholderGroup,
} from "./DebugMapRenderer";
import { mapGenerationEndpoint } from "./MapGenerationEndpoint";
import type { GeneratedMap } from "./MapGenerationTypes";
import type { TileType } from "./MapGenerationTypes";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
  RAMP_HEIGHT,
  TILE_LENGTH,
} from "./TileCatalog";
import { PROCGEN_TILE_TO_ASSET } from "./procgenAssetKeys";
import {
  scaleProcgenModelToWorldUnits,
  snapRampExitFloorToHeight,
  centerModelOnDeckOrigin,
  procgenModelExtentForAssetKey,
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
}

function createDebugSeed(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function debugMaxTilesForDifficulty(targetDifficulty: number): number {
  const level = Math.max(1, Math.min(20, Math.round(targetDifficulty)));
  return 16 + level * 5;
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
    // Scale to full tile footprint using Z axis only (ignore wall height).
    scaleProcgenModelToWorldUnits(
      node,
      procgenModelExtentForAssetKey(key),
      true,
    );
    // Centre XZ on deck origin and snap bottom to y=0.
    centerModelOnDeckOrigin(node, 0);
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
    type === "hole_placeholder"
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
  private readonly socketOverlay = new THREE.Group();
  private socketHelpersVisible = true;
  private mode: "single" | "map" = "single";
  private singleTileType: TileType = "straight_right_wall";
  private currentMap: GeneratedMap | null = null;
  private raf = 0;
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
      this.showGeneratedMap();
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

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 6);
    this.controls.update();

    this.scene.background = new THREE.Color(SKY_BLUE);
    const amb = new THREE.AmbientLight(0xfff5e8, 0.55);
    const dir = new THREE.DirectionalLight(0xfff0dd, 1.2);
    dir.position.set(8, 22, 12);
    this.scene.add(amb, dir);
    this.scene.add(this.mainGroup);
    this.scene.add(this.socketOverlay);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.canvas.tabIndex = 0;
    void this.canvas.focus();
    this.resizeRenderer();
    this.showSingleTile(this.singleTileType);
    this.tick();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
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

  /** Public API — same as pressing G. */
  generateMapFromUi(seed?: string, targetDifficulty = 6): string {
    return this.showGeneratedMap(seed, targetDifficulty);
  }

  /** Public API — same as pressing 1..5. */
  showPresetTile(index1To5: 1 | 2 | 3 | 4 | 5): void {
    this.showSingleTile(SINGLE_KEYS[index1To5 - 1]);
  }

  private toggleSockets(): void {
    this.socketHelpersVisible = !this.socketHelpersVisible;
    this.socketOverlay.visible = this.socketHelpersVisible;
  }

  private clearGroups(): void {
    this.disposeGroupContents(this.mainGroup);
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
    if (!this.socketHelpersVisible) {
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
    this.mainGroup.add(meshRoot);

    this.rebuildSocketHelpers();
  }

  private showGeneratedMap(seed = createDebugSeed(), targetDifficulty = 6): string {
    const map = mapGenerationEndpoint.generateMap({
      seed,
      levelIndex: 6,
      targetDifficulty,
      maxTiles: debugMaxTilesForDifficulty(targetDifficulty),
      allowRamps: targetDifficulty >= 3,
      allowCurves: targetDifficulty >= 2,
    });

    this.mode = "map";
    this.currentMap = map;
    this.options.onMapGenerated?.(map);
    this.clearGroups();

    const placeholders = createDebugPlaceholderGroup(map);
    this.mainGroup.add(placeholders);
    this.mainGroup.add(createDebugEndpointLabels(map));

    for (const t of map.tiles) {
      const def = getTileDefinition(t.tileType);
      const deck = deckCenterWorldFromPivot(t.position, t.rotationY, def);
      // cloneTileModel already centres the model on the deck origin (XZ) and
      // snaps its bottom to y=0 — no extra pivot offset needed here.
      const art = buildTileVisual(t.tileType);
      const piece = new THREE.Group();
      piece.position.set(deck.x, deck.y, deck.z);
      piece.rotation.y = t.rotationY;
      art.name = `procgen_debug_art_${t.tileType}_${t.id}`;
      piece.add(art);
      this.mainGroup.add(piece);
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
    return seed;
  }

  private tick = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };
}
