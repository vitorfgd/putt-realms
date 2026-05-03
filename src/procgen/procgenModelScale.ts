import * as THREE from "three";
import { TILE_LENGTH } from "./TileCatalog";

/**
 * Procgen tile art (FBX) is scaled so its **axis-aligned bounding box**'s
 * largest side equals this many Three.js world units (default **2**).
 *
 * NOTE: this small value is intentional for the **debug slab renderer** only
 * (`DebugMapRenderer`) which draws coloured placeholder boxes — it is NOT the
 * correct scale for full-size gameplay/debug-viewer art.  Use
 * {@link PROC_GEN_TILE_MODEL_EXTENT} when placing real models.
 */
export const PROC_GEN_MODEL_TARGET_MAX_EXTENT = 2;

/**
 * Target world-unit max-extent for **full-scale** procgen art tiles.
 *
 * Set to {@link TILE_LENGTH} (the longer axis = 6) so that after scaling the
 * model's geometry fills the entire catalogued 4 × 6 tile footprint.  The
 * artist pivot offset `(-halfWidth, 0, +halfLength)` = `(-2, 0, +3)` is then
 * geometrically consistent and both double-row lanes tile flush with no gaps.
 */
export const PROC_GEN_TILE_MODEL_EXTENT = TILE_LENGTH; // 6

/**
 * The current L-corner/end-cap source art includes wall thickness on both horizontal
 * axes (`210 x 210`), while straight/ramp wall assets are `210 x 200`.
 * Scaling both by their Z extent made corner walls about 0.15 world units shorter.
 * Use the same 210/200 ratio for corner-family assets so wall outside faces align.
 */
export const PROC_GEN_CORNER_MODEL_EXTENT = TILE_LENGTH * 1.05; // 6.3

export function procgenModelExtentForAssetKey(assetKey: string): number {
  return assetKey === "tile_convex_rw" ||
    assetKey === "tile_concave_rw" ||
    assetKey === "tile_start_ph" ||
    assetKey === "tile_hole_ph"
    ? PROC_GEN_CORNER_MODEL_EXTENT
    : PROC_GEN_TILE_MODEL_EXTENT;
}

/**
 * Uniform scale so the model's bounding box matches `targetMaxExtent` world units.
 *
 * @param ignoreHeight - When **true**, only the horizontal footprint (XZ) is used to
 *   compute the span, so a tall wall never causes the tile to be scaled down below the
 *   intended ground footprint.  Pass `true` for all procgen tile models.
 */
export function scaleProcgenModelToWorldUnits(
  root: THREE.Object3D,
  targetMaxExtent = PROC_GEN_MODEL_TARGET_MAX_EXTENT,
  ignoreHeight = false,
): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  // Tile models: scale so the **Z (forward) extent** = targetMaxExtent exactly.
  //   • Ignores wall height (Y) — tall walls must not shrink the ground footprint.
  //   • Uses size.z directly (not max(X,Z)) — if rails/walls make X > Z the tile
  //     would otherwise be scaled down, leaving a visible gap between rows.
  // Debug slabs / other uses: include all axes for a true bounding-sphere scale.
  const span = ignoreHeight
    ? (size.z > 1e-8 ? size.z : Math.max(size.x, size.z))
    : Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span < 1e-8) return;
  root.scale.setScalar(targetMaxExtent / span);
}

/**
 * After scale/rotate, top-left pivots can leave the mesh floating when the root is at y=0.
 * Shifts the clone in **local Y** so the world AABB minimum sits on `groundY`.
 */
export function snapModelBottomToLocalGround(
  root: THREE.Object3D,
  groundY = 0,
): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  root.position.y += groundY - box.min.y;
}

/**
 * Measures the **exit floor height** of a ramp model by sampling mesh vertices near the
 * high-Z end of the bounding box and returning the minimum Y found there.
 *
 * ### Why vertex sampling instead of bounding-box arithmetic
 * A ramp model's bounding-box `max.y` includes the wall above the slope exit — subtracting
 * a "wall height" reference is unreliable because the two tiles' Z-scale factors differ.
 * Vertex sampling isolates the floor surface directly: the lowest vertex near the exit face
 * is always the floor, not the wall top.
 *
 * ### When to call
 * Call **after** {@link scaleProcgenModelToWorldUnits} **and after**
 * {@link centerModelOnDeckOrigin} (so the model is centred and bottom-snapped first).
 * The returned Y is in the model's local space (= world space before the piece group
 * applies rotationY).
 *
 * @param exitZFraction - Fraction of the Z span from the exit edge to sample within.
 *   Default 0.15 = the outermost 15 % of the tile length (0.9 world units for TILE_LENGTH=6).
 */
export function measureRampExitFloorY(
  root: THREE.Object3D,
  exitZFraction = 0.15,
): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const zSpan = box.max.z - box.min.z;
  const zThreshold = box.max.z - zSpan * exitZFraction;

  let minY = Infinity;
  const localPos = new THREE.Vector3();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const attr = mesh.geometry.attributes["position"];
    if (!attr) return;
    for (let i = 0; i < attr.count; i++) {
      localPos.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld);
      if (localPos.z >= zThreshold) {
        minY = Math.min(minY, localPos.y);
      }
    }
  });

  return Number.isFinite(minY) ? minY : 0;
}

/**
 * After {@link scaleProcgenModelToWorldUnits} and {@link centerModelOnDeckOrigin},
 * shifts the model in local Y so its **exit-floor** (the floor at the high-Z end,
 * measured by vertex sampling) lands exactly at `targetExitFloorY`.
 *
 * This eliminates the vertical seam between a ramp tile and the next flat tile
 * while preserving all model proportions (only a pure Y translation, no deformation).
 *
 * @param targetExitFloorY - Desired exit-floor height in the model's local space.
 *   Pass `RAMP_HEIGHT` (= 2) to match the catalog elevation delta.
 */
export function snapRampExitFloorToHeight(
  root: THREE.Object3D,
  targetExitFloorY: number,
  exitZFraction = 0.15,
): void {
  const measured = measureRampExitFloorY(root, exitZFraction);
  if (!Number.isFinite(measured)) return;
  root.position.y += targetExitFloorY - measured;
}

/**
 * Centers a scaled tile model on the **deck origin** (XZ) and snaps its bottom to `groundY`,
 * regardless of where the artist placed the model's local origin (top-left, center, etc.).
 *
 * Algorithm:
 * 1. Assumes the model has already been scaled (e.g. via {@link scaleProcgenModelToWorldUnits}).
 * 2. Resets position to (0,0,0), recomputes world AABB.
 * 3. Offsets by the negative XZ centroid so the model's footprint is centred at the origin.
 * 4. Offsets Y so the bottom face sits on `groundY`.
 *
 * This replaces the hard-coded `pivotOffsetFromDeckOrigin` approach, which only works when
 * the artist exported every tile with its pivot at the top-left corner.
 */
export function centerModelOnDeckOrigin(
  root: THREE.Object3D,
  groundY = 0,
): void {
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.x)) return;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  root.position.set(-cx, groundY - box.min.y, -cz);
}
