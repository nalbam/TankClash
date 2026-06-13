import * as THREE from "three";
import { GRAVITY, VEHICLE } from "@shared/constants";
import type { TerrainGrid } from "@shared/terrain";
import { CANNON } from "@shared/weapons";

const POINTS = 36;
const SIM_DT = 0.06;
const MUZZLE_OFFSET = VEHICLE.HALF_W + 1.0;

/**
 * Wind-aware aim preview: simulates the cannon arc client-side with the same
 * constants the server uses and draws fading dots until the terrain hit.
 */
export class TrajectoryPreview {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private alphas: Float32Array;

  constructor() {
    this.positions = new Float32Array(POINTS * 3);
    this.alphas = new Float32Array(POINTS);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(0x2dd4bf) } },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 160.0 * alpha / -mv.z + 2.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          gl_FragColor = vec4(color, vAlpha * (1.0 - d * 1.6));
        }
      `,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(
    visible: boolean,
    tankX: number,
    tankY: number,
    aimAngle: number,
    charge: number,
    wind: number,
    terrain: TerrainGrid,
  ): void {
    this.points.visible = visible;
    if (!visible) return;

    const speed = CANNON.minSpeed + (CANNON.maxSpeed - CANNON.minSpeed) * charge;
    const cos = Math.cos(aimAngle);
    const sin = Math.sin(aimAngle);
    let x = tankX + cos * MUZZLE_OFFSET;
    let y = tankY + 0.6 + sin * MUZZLE_OFFSET;
    let vx = cos * speed;
    let vy = sin * speed;

    let hit = false;
    for (let i = 0; i < POINTS; i++) {
      if (!hit) {
        vx += wind * CANNON.windInfluence * SIM_DT;
        vy += GRAVITY * SIM_DT;
        x += vx * SIM_DT;
        y += vy * SIM_DT;
        if (terrain.solidAtWorld(x, y) || y < -10) hit = true;
      }
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 1.2;
      this.alphas[i] = hit && i > 0 ? 0 : Math.max(0.12, 0.85 - (i / POINTS) * 0.7);
      if (hit && this.alphas[i] === 0 && i > 0) {
        // Keep the impact dot itself bright.
        this.alphas[i - 1] = Math.max(this.alphas[i - 1], 0.9);
      }
    }

    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("alpha") as THREE.BufferAttribute).needsUpdate = true;
  }
}
