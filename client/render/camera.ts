import * as THREE from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import { clamp } from "@shared/math";

const CAMERA_Z_MIN = 70;
const CAMERA_Z_MAX = 135;
const FRAME_MARGIN = 24; // world units kept around both tanks

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private targetX = WORLD_WIDTH / 2;
  private targetY = WORLD_HEIGHT * 0.45;
  private targetZ = CAMERA_Z_MIN + 20;
  private shakeTime = 0;
  private shakeStrength = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 600);
    this.camera.position.set(this.targetX, this.targetY, this.targetZ);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(strength: number): void {
    this.shakeStrength = Math.min(2.5, this.shakeStrength + strength);
    this.shakeTime = 0.45;
  }

  /**
   * Follow the local tank while keeping the nearest enemy in frame:
   * the camera aims at a weighted midpoint and zooms out with distance.
   */
  update(
    focusX: number,
    focusY: number,
    aimLeadX: number,
    dt: number,
    enemy?: { x: number; y: number } | null,
  ): void {
    if (enemy) {
      // Weighted midpoint (bias toward the local tank).
      this.targetX = focusX * 0.62 + enemy.x * 0.38 + aimLeadX * 4;
      this.targetY = Math.max(focusY, (focusY + enemy.y) / 2) + 6;
      const spanX = Math.abs(enemy.x - focusX) / 2 + FRAME_MARGIN;
      const spanY = Math.abs(enemy.y - focusY) / 2 + FRAME_MARGIN * 0.6;
      const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
      const zForWidth = spanX / (tanHalf * this.camera.aspect);
      const zForHeight = spanY / tanHalf;
      this.targetZ = clamp(Math.max(zForWidth, zForHeight), CAMERA_Z_MIN, CAMERA_Z_MAX);
    } else {
      this.targetX = focusX + aimLeadX * 6;
      this.targetY = focusY + 8;
      this.targetZ = CAMERA_Z_MIN + 20;
    }

    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * this.targetZ;
    const halfW = halfH * this.camera.aspect;
    const cx = clamp(this.targetX, Math.min(halfW, WORLD_WIDTH / 2), Math.max(WORLD_WIDTH - halfW, WORLD_WIDTH / 2));
    const cy = clamp(this.targetY, Math.min(halfH * 0.8, WORLD_HEIGHT / 2), WORLD_HEIGHT);

    const smooth = 1 - Math.exp(-5 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * smooth;
    this.camera.position.y += (cy - this.camera.position.y) * smooth;
    this.camera.position.z += (this.targetZ - this.camera.position.z) * (1 - Math.exp(-3 * dt));

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
