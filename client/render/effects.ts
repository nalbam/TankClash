import * as THREE from "three";
import type { ProjectileView } from "../net/colyseusClient";

interface Particle {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxR: number;
}

const POOL_SIZE = 240;

function makeRadialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Pooled sprite particles: explosions, smoke, muzzle flash, projectile trails. */
export class Effects {
  readonly group = new THREE.Group();
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private projectileMeshes = new Map<string, THREE.Mesh>();
  private trailTimer = 0;

  private fireMat: THREE.SpriteMaterial;
  private smokeMat: THREE.SpriteMaterial;
  private trailMat: THREE.SpriteMaterial;
  private projGeo = new THREE.SphereGeometry(0.45, 10, 8);
  private projMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });

  constructor() {
    this.fireMat = new THREE.SpriteMaterial({
      map: makeRadialTexture("rgba(255,220,150,1)", "rgba(255,90,20,0)"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.smokeMat = new THREE.SpriteMaterial({
      map: makeRadialTexture("rgba(90,90,100,0.8)", "rgba(60,60,70,0)"),
      depthWrite: false,
      transparent: true,
    });
    this.trailMat = new THREE.SpriteMaterial({
      map: makeRadialTexture("rgba(255,200,120,0.9)", "rgba(255,140,46,0)"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = new THREE.Sprite(this.fireMat);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, gravity: 0 });
    }
  }

  spawnExplosion(x: number, y: number, r: number): void {
    // Fireball burst.
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 16;
      this.emit(this.fireMat, x, y, Math.cos(a) * speed, Math.sin(a) * speed * 0.9 + 3, 0.45 + Math.random() * 0.3, 1.2 + Math.random() * r * 0.35, -10);
    }
    // Smoke plume.
    for (let i = 0; i < 12; i++) {
      this.emit(
        this.smokeMat,
        x + (Math.random() - 0.5) * r * 0.6,
        y + Math.random() * 1.5,
        (Math.random() - 0.5) * 3,
        3 + Math.random() * 4,
        1.1 + Math.random() * 0.7,
        1.8 + Math.random() * 2,
        2,
      );
    }
    // Shockwave ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffc890,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.position.set(x, y, 2);
    this.group.add(ring);
    this.shockwaves.push({ mesh: ring, life: 0.4, maxLife: 0.4, maxR: r * 1.7 });
  }

  spawnMuzzleFlash(x: number, y: number, angle: number): void {
    for (let i = 0; i < 6; i++) {
      const spread = angle + (Math.random() - 0.5) * 0.5;
      const speed = 8 + Math.random() * 10;
      this.emit(this.fireMat, x, y, Math.cos(spread) * speed, Math.sin(spread) * speed, 0.18 + Math.random() * 0.1, 0.8 + Math.random() * 0.6, 0);
    }
  }

  /** Glowing projectile spheres + emitted trail particles. */
  syncProjectiles(projectiles: Map<string, ProjectileView>, dt: number): void {
    this.trailTimer -= dt;
    const emitTrail = this.trailTimer <= 0;
    if (emitTrail) this.trailTimer = 0.02;

    for (const [id, view] of projectiles) {
      let mesh = this.projectileMeshes.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.projGeo, this.projMat);
        this.projectileMeshes.set(id, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(view.x, view.y, 0.5);
      if (emitTrail) {
        this.emit(this.trailMat, view.x, view.y, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.35, 0.9, 0);
      }
    }
    for (const id of [...this.projectileMeshes.keys()]) {
      if (!projectiles.has(id)) {
        const mesh = this.projectileMeshes.get(id)!;
        this.group.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vy += p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      const t = p.life / p.maxLife;
      p.sprite.scale.setScalar(p.size * (0.6 + (1 - t) * 0.8));
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, t * 1.6);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.life -= dt;
      const t = 1 - w.life / w.maxLife;
      if (w.life <= 0) {
        this.group.remove(w.mesh);
        w.mesh.geometry.dispose();
        (w.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      w.mesh.scale.setScalar(1 + t * w.maxR);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }
  }

  private emit(
    material: THREE.SpriteMaterial,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    gravity: number,
  ): void {
    const p = this.pool.pop();
    if (!p) return;
    p.sprite.material = material;
    p.sprite.position.set(x, y, 1.5);
    p.sprite.scale.setScalar(size);
    p.sprite.visible = true;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    this.active.push(p);
  }
}
