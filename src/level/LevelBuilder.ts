import * as THREE from "three";
import type { GeneratedLevel } from "./LevelTypes";
import {
  appendHoleFlagVisual,
  appendHolePortalVisuals,
  buildTileGroup,
} from "./tiles/TileKit";

export type { ProcgenAdaptOptions } from "./procgenLevelAdapter";
export { adaptProcgenMapToGeneratedLevel } from "./procgenLevelAdapter";

export class LevelBuilder {
  /**
   * @returns Mixers for hole flags (GLTF); update each frame with `mixer.update(dt)`.
   */
  buildInto(
    parent: THREE.Object3D,
    level: GeneratedLevel,
    _rng: () => number = Math.random,
  ): THREE.AnimationMixer[] {
    void _rng;
    const mixers: THREE.AnimationMixer[] = [];
    const course = new THREE.Group();
    course.name = `Course_${level.id}`;

    for (const tile of level.tiles) {
      const piece = buildTileGroup(tile);
      piece.position.set(tile.worldX, tile.worldY ?? 0, tile.worldZ);
      piece.rotation.y = tile.rotationY;
      const m = piece.userData.holeFlagMixer as THREE.AnimationMixer | undefined;
      if (m) mixers.push(m);
      course.add(piece);
    }

    if (level.tiles.some((tile) => tile.type === "hole" && tile.assetKeyOverride)) {
      const holeMarker = new THREE.Group();
      holeMarker.name = "GeneratedHolePortalMarker";
      appendHolePortalVisuals(holeMarker);
      appendHoleFlagVisual(holeMarker);
      holeMarker.position.set(
        level.holePosition.x,
        level.holePosition.y,
        level.holePosition.z,
      );
      course.add(holeMarker);
    }

    parent.add(course);
    return mixers;
  }
}
