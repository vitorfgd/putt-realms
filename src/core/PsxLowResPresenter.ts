import * as THREE from "three";
import {
  PSX_PRESENT_COLOR_LEVELS,
  PSX_PRESENT_ORDERED_DITHER_STRENGTH,
  PSX_PRESENT_SCANLINE_STRENGTH,
} from "./Constants";

/**
 * Renders the main scene into a reduced-resolution RT, then draws it with nearest
 * filtering into the gameplay viewport (Unity-style low-res + upscale).
 *
 * When no optional effects are enabled, the blit uses `MeshBasicMaterial` (same brightness
 * and colour pipeline as before). Optional quantise / ordered dither / scanlines switch
 * to a single fullscreen shader governed by revertable Constants.
 */
export class PsxLowResPresenter {
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly blitScene: THREE.Scene;
  private readonly blitCamera: THREE.OrthographicCamera;
  private readonly blitMesh: THREE.Mesh;
  private readonly basicMaterial: THREE.MeshBasicMaterial | null;
  private readonly effectMaterial: THREE.ShaderMaterial | null;
  private lastRtW = -1;
  private lastRtH = -1;

  constructor(renderer: THREE.WebGLRenderer, private readonly scale: number) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: true,
      generateMipmaps: false,
    });
    const cs =
      renderer.outputColorSpace ??
      THREE.SRGBColorSpace;
    this.rt.texture.colorSpace = cs;

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitCamera.position.z = 1;

    const ql = PSX_PRESENT_COLOR_LEVELS > 1.5 ? PSX_PRESENT_COLOR_LEVELS : 0;
    const dl = PSX_PRESENT_ORDERED_DITHER_STRENGTH;
    const sl = PSX_PRESENT_SCANLINE_STRENGTH;

    const useShader =
      ql > 1.5 || dl > 1e-4 || sl > 1e-4;

    const geo = new THREE.PlaneGeometry(2, 2);

    if (useShader) {
      this.basicMaterial = null;
      const ditherClamp = THREE.MathUtils.clamp(dl, 0, 1);
      const scanClamp = THREE.MathUtils.clamp(sl, 0, 1);

      this.effectMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: this.rt.texture },
          colorLevels: { value: ql },
          ditherStrength: { value: ditherClamp },
          scanlineStrength: { value: scanClamp },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform float colorLevels;
          uniform float ditherStrength;
          uniform float scanlineStrength;
          varying vec2 vUv;

          float bayer4(vec2 ip) {
            float x = mod(ip.x, 4.0);
            float y = mod(ip.y, 4.0);
            vec4 row0 = vec4(0.0, 8.0, 2.0, 10.0) / 16.0;
            vec4 row1 = vec4(12.0, 4.0, 14.0, 6.0) / 16.0;
            vec4 row2 = vec4(3.0, 11.0, 1.0, 9.0) / 16.0;
            vec4 row3 = vec4(15.0, 7.0, 13.0, 5.0) / 16.0;
            vec4 r = y < 1.0 ? row0 : y < 2.0 ? row1 : y < 3.0 ? row2 : row3;
            return x < 1.0 ? r.x : x < 2.0 ? r.y : x < 3.0 ? r.z : r.w;
          }

          void main() {
            vec4 c = texture2D(map, vUv);

            if (ditherStrength > 1.0e-4) {
              vec2 fc = floor(gl_FragCoord.xy);
              float th = bayer4(fc);
              c.rgb += (th - 0.46875) * ditherStrength * 0.125;
            }

            if (colorLevels > 1.5) {
              c.rgb = clamp(c.rgb, 0.0, 1.0);
              c.rgb = floor(c.rgb * colorLevels + 0.5) / colorLevels;
            }

            if (scanlineStrength > 1.0e-4) {
              float alt = mod(gl_FragCoord.y, 2.0);
              float dim = 1.0 - 0.1 * scanlineStrength;
              float boost = 1.0 + 0.05 * scanlineStrength;
              c.rgb *= alt < 1.0 ? dim : boost;
            }

            gl_FragColor = c;
          }
        `,
        depthTest: false,
        depthWrite: false,
      });
      this.blitMesh = new THREE.Mesh(geo, this.effectMaterial);
    } else {
      this.effectMaterial = null;
      this.basicMaterial = new THREE.MeshBasicMaterial({
        map: this.rt.texture,
        depthTest: false,
        depthWrite: false,
      });
      this.blitMesh = new THREE.Mesh(geo, this.basicMaterial);
    }

    this.blitMesh.frustumCulled = false;
    this.blitScene = new THREE.Scene();
    this.blitScene.add(this.blitMesh);
  }

  dispose(): void {
    this.rt.dispose();
    this.blitMesh.geometry.dispose();
    if (this.basicMaterial) this.basicMaterial.dispose();
    if (this.effectMaterial) this.effectMaterial.dispose();
  }

  resizeForViewport(vpW: number, vpH: number): void {
    const rtw = Math.max(2, Math.floor(vpW / this.scale));
    const rth = Math.max(2, Math.floor(vpH / this.scale));
    if (rtw !== this.lastRtW || rth !== this.lastRtH) {
      this.lastRtW = rtw;
      this.lastRtH = rth;
      this.rt.setSize(rtw, rth);
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    clearColorHex: THREE.ColorRepresentation,
    viewport: { x: number; y: number; width: number; height: number },
  ): void {
    this.resizeForViewport(viewport.width, viewport.height);

    if (this.basicMaterial) {
      this.basicMaterial.map = this.rt.texture;
    } else if (this.effectMaterial) {
      this.effectMaterial.uniforms.map!.value = this.rt.texture;
    }

    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.rt);
    renderer.setViewport(0, 0, this.rt.width, this.rt.height);
    renderer.setScissorTest(false);
    renderer.setClearColor(clearColorHex, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    );
    renderer.setScissor(
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
    );
    renderer.setScissorTest(true);
    renderer.render(this.blitScene, this.blitCamera);
    renderer.autoClear = prevAutoClear;
  }
}
