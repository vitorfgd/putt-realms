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
 * Source tile art convention:
 * - every playable grass base is 200 x 200 source units;
 * - walls live outside that base (for example right-wall straights are 220 x 200).
 *
 * Placement must scale and align by this grass base, not by the total model bounds, or
 * exterior wall thickness starts changing tile spacing and produces overlapping floors.
 */
export const PROC_GEN_SOURCE_GRASS_BASE_EXTENT = 200;

/**
 * Target max horizontal footprint for scaling (see {@link scaleProcgenModelToWorldUnits}).
 * Corner family meshes are authored slightly larger than straights; matching that here
 * keeps outer wall faces flush with adjacent straights.
 */
export function procgenModelExtentForAssetKey(assetKey: string): number {
  void assetKey;
  return PROC_GEN_TILE_MODEL_EXTENT;
}

/**
 * {@link FBXLoader} roots often carry DCC export TRS (e.g. axis flips).
 * Procgen catalog math assumes a **neutral** root: mesh geometry lives in children.
 * Scaling / pivot offsets on a rotated root apply in the wrong local frame and tiles
 * drift off the grid while deck labels (from solver pivot + catalog) stay correct.
 */
export function resetProcgenAssetInstanceRoot(node: THREE.Object3D): void {
  node.position.set(0, 0, 0);
  node.rotation.set(0, 0, 0);
  node.scale.set(1, 1, 1);
  node.updateMatrix();
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
 * Scale procgen tile art so the 200 x 200 grass base maps to the world tile size.
 * Exterior walls are intentionally allowed to extend outside the resulting footprint.
 */
export function scaleProcgenModelGrassBaseToWorldUnits(
  root: THREE.Object3D,
  targetGrassExtent = TILE_LENGTH,
): void {
  root.scale.setScalar(targetGrassExtent / PROC_GEN_SOURCE_GRASS_BASE_EXTENT);
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
 * Call **after** {@link scaleProcgenModelToWorldUnits} **and after** placing the model
 * on the deck (pivot offset + {@link snapModelBottomToLocalGround}, or
 * {@link centerModelOnDeckOrigin} for non-catalog assets).
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
 * After {@link scaleProcgenModelToWorldUnits} and deck placement (catalog pivot + bottom snap
 * or {@link centerModelOnDeckOrigin}),
 * shifts the model in local Y so its **exit-floor** (the floor at the high-Z end,
 * measured by vertex sampling) lands exactly at `targetExitFloorY`.
 *
 * This eliminates the vertical seam between a ramp tile and the next flat tile
 * while preserving all model proportions (only a pure Y translation, no deformation).
 *
 * @param targetExitFloorY - Desired exit-floor height in the model's local space.
 *   Pass `RAMP_HEIGHT` to match the catalog elevation delta.
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

/**
 * Align the 200 x 200 source grass base to the deck origin and snap the model bottom.
 *
 * The current tile FBXs are authored with the grass base at local X/Z 0..200. Any
 * wall thickness outside that base remains outside the tile after placement, so
 * neighboring grass bases meet without overlapping.
 */
export function alignProcgenModelGrassBaseToDeckOrigin(
  root: THREE.Object3D,
  groundY = 0,
): void {
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  const baseCenter = (PROC_GEN_SOURCE_GRASS_BASE_EXTENT * root.scale.x) / 2;
  root.position.set(-baseCenter, groundY - box.min.y, -baseCenter);
}
