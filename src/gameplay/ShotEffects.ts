import * as THREE from "three";
import { Ball } from "./Ball";
import type { CourseSurface } from "../level/LevelTypes";
import { sampleCourseSurface } from "../level/courseSurface";
import { goldCoin } from "../art/Materials";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

function makeDiscMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export class ShotEffects {
  readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly trail: THREE.Mesh[] = [];
  private readonly particleGeo = new THREE.IcosahedronGeometry(0.08, 0);
  private readonly dustMat = makeDiscMaterial(0xe7ffc1, 0.82);
  private readonly sparkleMat = makeDiscMaterial(0xffe176, 0.92);
  private readonly trailMat = makeDiscMaterial(0xa6fff6, 0.48);
  private readonly confettiMats = [
    makeDiscMaterial(0xff5570, 0.95),
    makeDiscMaterial(0xffdc4a, 0.95),
    makeDiscMaterial(0x55e084, 0.95),
    makeDiscMaterial(0x78d4ff, 0.95),
  ];
  private readonly shadow: THREE.Mesh;
  private surface: CourseSurface | null = null;
  private squashTimer = 0;
  private trailTimer = 0;

  constructor(private readonly ball: Ball) {
    this.group.name = "ShotEffects";
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0b2418,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -5;
    this.group.add(this.shadow);
  }

  setSurface(surface: CourseSurface): void {
    this.surface = surface;
  }

  dispose(): void {
    for (const p of this.particles) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    for (const t of this.trail) {
      this.group.remove(t);
      t.geometry.dispose();
    }
    this.particles.length = 0;
    this.trail.length = 0;
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.particleGeo.dispose();
    this.dustMat.dispose();
    this.sparkleMat.dispose();
    this.trailMat.dispose();
    this.confettiMats.forEach((m) => m.dispose());
  }

  onShot(power01: number, dir: THREE.Vector2): void {
    this.squashTimer = 0.18 + power01 * 0.08;
    this.trailTimer = power01 > 0.58 ? 0.55 + power01 * 0.35 : 0;
    const base = this.ball.position;
    const count = 10 + Math.floor(power01 * 18);
    for (let i = 0; i < count; i++) {
      const side = (Math.random() - 0.5) * 1.6;
      const back = 0.4 + Math.random() * 0.55;
      const pos = new THREE.Vector3(
        base.x - dir.x * back + -dir.y * side * 0.25,
        base.y + 0.08,
        base.z - dir.y * back + dir.x * side * 0.25,
      );
      this.spawnParticle(pos, this.dustMat, {
        x: -dir.x * (0.5 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2,
        y: 0.55 + Math.random() * 1.2,
        z: -dir.y * (0.5 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2,
      });
    }
  }

  onRailBump(): void {
    this.spawnBurst(this.ball.position, 6, 0xa6fff6);
  }

  onHazardHit(): void {
    this.spawnBurst(this.ball.position, 12, 0xff7a5a);
  }

  onOob(): void {
    this.spawnBurst(this.ball.position, 18, 0x78d4ff);
  }

  onCoinPickup(pos: THREE.Vector3): void {
    this.spawnBurst(pos, 12, 0xffd84a);
  }

  onHoleScore(pos: THREE.Vector3): void {
    for (let i = 0; i < 48; i++) {
      const mat = this.confettiMats[i % this.confettiMats.length]!;
      this.spawnParticle(pos.clone().add(new THREE.Vector3(0, 0.35, 0)), mat, {
        x: (Math.random() - 0.5) * 6,
        y: 2.4 + Math.random() * 4.4,
        z: (Math.random() - 0.5) * 6,
      }, 1.1 + Math.random() * 0.8);
    }
  }

  update(deltaSeconds: number): void {
    this.updateSquash(deltaSeconds);
    this.updateShadow();
    this.updateTrail(deltaSeconds);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= deltaSeconds;
      p.velocity.y -= 5.8 * deltaSeconds;
      p.mesh.position.addScaledVector(p.velocity, deltaSeconds);
      p.mesh.rotation.x += deltaSeconds * 5.1;
      p.mesh.rotation.y += deltaSeconds * 4.7;
      const u = Math.max(0, p.life / p.maxLife);
      p.mesh.scale.setScalar(0.45 + u * 0.9);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = u * 0.9;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  private updateSquash(deltaSeconds: number): void {
    if (this.squashTimer <= 0) return;
    this.squashTimer -= deltaSeconds;
    const u = Math.max(0, this.squashTimer / 0.24);
    const pulse = Math.sin(u * Math.PI);
    this.ball.visualRoot.scale.set(1 + pulse * 0.12, 1 - pulse * 0.16, 1 + pulse * 0.12);
    if (this.squashTimer <= 0) {
      this.ball.visualRoot.scale.setScalar(1);
    }
  }

  private updateShadow(): void {
    const support = this.surface
      ? sampleCourseSurface(this.surface, this.ball.position.x, this.ball.position.z)
      : null;
    if (!support) {
      this.shadow.visible = false;
      return;
    }
    const h = Math.max(0, this.ball.position.y - support.y);
    this.shadow.visible = true;
    this.shadow.position.set(this.ball.position.x, support.y + 0.008, this.ball.position.z);
    const s = Ball.RADIUS * (2.1 + Math.min(1.8, h * 0.28));
    this.shadow.scale.set(s, s, s);
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0.08, 0.34 - h * 0.055);
  }

  private updateTrail(deltaSeconds: number): void {
    if (this.trailTimer > 0) {
      this.trailTimer -= deltaSeconds;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), this.trailMat.clone());
      mesh.position.copy(this.ball.position).add(new THREE.Vector3(0, Ball.RADIUS * 0.9, 0));
      mesh.userData.life = 0.42;
      mesh.userData.maxLife = 0.42;
      this.trail.push(mesh);
      this.group.add(mesh);
    }
    if (this.trail.length > 24) {
      const old = this.trail.shift()!;
      this.group.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i]!;
      t.userData.life = Math.max(0, (t.userData.life as number) - deltaSeconds);
      const u = t.userData.life / (t.userData.maxLife as number);
      t.scale.setScalar(Math.max(0.04, u));
      (t.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.42 * u);
      if (u <= 0) {
        this.group.remove(t);
        this.trail.splice(i, 1);
        t.geometry.dispose();
        (t.material as THREE.Material).dispose();
      }
    }
  }

  private spawnBurst(pos: THREE.Vector3, count: number, color: number): void {
    const mat = color === 0xffd84a ? this.sparkleMat : makeDiscMaterial(color, 0.9);
    for (let i = 0; i < count; i++) {
      this.spawnParticle(pos.clone(), mat, {
        x: (Math.random() - 0.5) * 4.2,
        y: 1 + Math.random() * 2.3,
        z: (Math.random() - 0.5) * 4.2,
      });
    }
  }

  private spawnParticle(
    pos: THREE.Vector3,
    mat: THREE.MeshBasicMaterial,
    velocity: { x: number; y: number; z: number },
    life = 0.45 + Math.random() * 0.35,
  ): void {
    const mesh = new THREE.Mesh(this.particleGeo, mat.clone());
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.65 + Math.random() * 0.8);
    this.group.add(mesh);
    this.particles.push({
      mesh,
      velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
      life,
      maxLife: life,
    });
  }
}

export function createCoinMesh(value: number): THREE.Group {
  const group = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 + value * 0.02, 0.22 + value * 0.02, 0.07, 16),
    goldCoin().clone(),
  );
  coin.rotation.x = Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.4, 18),
    makeDiscMaterial(0xfff0a0, 0.36),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.03;
  group.add(coin, glow);
  return group;
}
