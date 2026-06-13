import * as THREE from "three";
import type { PlayerInput } from "@shared/types";

/**
 * Keyboard/mouse capture. Aim angle is derived from the mouse position
 * unprojected onto the z=0 gameplay plane relative to the local tank.
 */
export class InputManager {
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseNdc = new THREE.Vector2();
  private dashQueued = false;
  private restartQueued = false;
  private weaponQueued: number | null = null;
  private seq = 0;
  scoreboardOpen = false;
  aimAngle = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.dashQueued = true;
      if (e.code === "Enter") this.restartQueued = true;
      const digit = e.code.match(/^Digit([1-5])$/);
      if (digit) this.weaponQueued = Number(digit[1]) - 1;
      if (e.code === "Tab") {
        this.scoreboardOpen = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Tab") {
        this.scoreboardOpen = false;
        e.preventDefault();
      }
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
      this.scoreboardOpen = false;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener("mousemove", (e) => {
      this.mouseNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Recomputes aim from the mouse ray against the z=0 plane. */
  updateAim(camera: THREE.Camera, tankX: number, tankY: number): void {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouseNdc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      this.aimAngle = Math.atan2(hit.y - tankY, hit.x - tankX);
    }
  }

  /** Builds the input packet; dash is edge-triggered. */
  sample(): PlayerInput {
    const dash = this.dashQueued;
    this.dashQueued = false;
    return {
      seq: ++this.seq,
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft"),
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      jump: this.keys.has("Space"),
      dash,
      aimAngle: this.aimAngle,
      charging: this.mouseDown,
    };
  }

  get charging(): boolean {
    return this.mouseDown;
  }

  consumeRestart(): boolean {
    const r = this.restartQueued;
    this.restartQueued = false;
    return r;
  }

  /** Returns a 0-based weapon index if a number key was pressed since last call. */
  consumeWeaponSelect(): number | null {
    const w = this.weaponQueued;
    this.weaponQueued = null;
    return w;
  }
}
