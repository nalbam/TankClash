import * as THREE from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import { clamp } from "@shared/math";

const CAMERA_Z = 92;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private targetX = WORLD_WIDTH / 2;
  private targetY = WORLD_HEIGHT * 0.45;
  private shakeTime = 0;
  private shakeStrength = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 600);
    this.camera.position.set(this.targetX, this.targetY, CAMERA_Z);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(strength: number): void {
    this.shakeStrength = Math.min(2.5, this.shakeStrength + strength);
    this.shakeTime = 0.45;
  }

  /** Follow a focus point (local tank, with slight aim lead), clamped to arena. */
  update(focusX: number, focusY: number, aimLeadX: number, dt: number): void {
    this.targetX = focusX + aimLeadX * 6;
    this.targetY = focusY + 8;

    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * CAMERA_Z;
    const halfW = halfH * this.camera.aspect;
    const cx = clamp(this.targetX, Math.min(halfW, WORLD_WIDTH / 2), Math.max(WORLD_WIDTH - halfW, WORLD_WIDTH / 2));
    const cy = clamp(this.targetY, Math.min(halfH * 0.8, WORLD_HEIGHT / 2), WORLD_HEIGHT);

    const smooth = 1 - Math.exp(-5 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * smooth;
    this.camera.position.y += (cy - this.camera.position.y) * smooth;

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeStrength * (this.shakeTime / 0.45);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      if (this.shakeTime <= 0) this.shakeStrength = 0;
    }

    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);
  }
}
