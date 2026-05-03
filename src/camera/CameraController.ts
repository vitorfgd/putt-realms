import * as THREE from "three";

/** Follow / bounds / shake hooks — placeholder only */
export class CameraController {
  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  update(_deltaSeconds: number): void {
    void this.camera;
  }
}
