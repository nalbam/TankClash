import * as THREE from "three";
import type { PlayerInput } from "@shared/types";

export const STICK_DEADZONE = 0.3;
export const TRIGGER_THRESHOLD = 0.4;

/** Left-stick X (or d-pad) → discrete left/right movement. Pure for testing. */
export function stickToMove(lx: number, dpadLeft = false, dpadRight = false): { left: boolean; right: boolean } {
  return {
    left: lx < -STICK_DEADZONE || dpadLeft,
    right: lx > STICK_DEADZONE || dpadRight,
  };
}

/** Right-stick → aim angle. Screen y is down, world y is up, so ry is negated. */
export function stickToAim(rx: number, ry: number): { active: boolean; angle: number } {
  if (Math.hypot(rx, ry) > STICK_DEADZONE) {
    return { active: true, angle: Math.atan2(-ry, rx) };
  }
  return { active: false, angle: 0 };
}

/**
 * Keyboard/mouse + gamepad capture. Aim comes from the mouse ray against the
 * z=0 plane, or — when a gamepad's right stick is active — directly from the
 * stick angle.
 */
export class InputManager {
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseNdc = new THREE.Vector2();
  private dashQueued = false;
  private restartQueued = false;
  private pauseToggleQueued = false;
  private weaponQueued: number | null = null;
  private weaponCycleQueued = 0;
  private seq = 0;
  scoreboardOpen = false;
  aimAngle = 0;

  // Gamepad state, refreshed each frame by pollGamepad().
  private gpConnected = false;
  private gpLeft = false;
  private gpRight = false;
  private gpJump = false;
  private gpCharge = false;
  /** Right stick is pushed → aim is driven by the pad, not the mouse. */
  gamepadAiming = false;
  private gpPrevButtons: boolean[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.dashQueued = true;
      if (e.code === "Enter") this.restartQueued = true;
      if (e.code === "Escape") this.pauseToggleQueued = true;
      const digit = e.code.match(/^Digit([0-9])$/);
      if (digit) {
        const n = Number(digit[1]);
        this.weaponQueued = n === 0 ? 9 : n - 1; // 1..9 → 0..8, 0 → 10th
      }
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

  /**
   * Poll the first connected gamepad. Standard mapping: left stick / d-pad move,
   * A jump, B dash, right trigger charge/fire, shoulder buttons cycle weapons,
   * right stick aims. Call once per frame before sampling.
   */
  pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected) ?? null;
    this.gpConnected = pad !== null;
    if (!pad) {
      this.gamepadAiming = false;
      return;
    }

    const axis = (i: number) => pad.axes[i] ?? 0;
    const pressed = (i: number) => (pad.buttons[i]?.value ?? 0) > TRIGGER_THRESHOLD || (pad.buttons[i]?.pressed ?? false);

    // Movement: left stick X or d-pad (buttons 14/15).
    const move = stickToMove(axis(0), pressed(14), pressed(15));
    this.gpLeft = move.left;
    this.gpRight = move.right;

    this.gpJump = pressed(0); // A
    this.gpCharge = pressed(7) || pressed(2); // right trigger or X

    // Right stick → aim angle.
    const aim = stickToAim(axis(2), axis(3));
    this.gamepadAiming = aim.active;
    if (aim.active) this.aimAngle = aim.angle;

    // Edge-triggered: dash (B), weapon cycle (LB/RB), restart (Start).
    const edge = (i: number) => pressed(i) && !this.gpPrevButtons[i];
    if (edge(1)) this.dashQueued = true; // B
    if (edge(5)) this.weaponCycleQueued = 1; // RB → next
    if (edge(4)) this.weaponCycleQueued = -1; // LB → prev
    if (edge(9)) this.pauseToggleQueued = true; // Start → pause

    this.gpPrevButtons = pad.buttons.map((b) => b.pressed || b.value > TRIGGER_THRESHOLD);
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

  /** Builds the input packet, merging keyboard/mouse with gamepad. */
  sample(): PlayerInput {
    const dash = this.dashQueued;
    this.dashQueued = false;
    return {
      seq: ++this.seq,
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.gpLeft,
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.gpRight,
      jump: this.keys.has("Space") || this.gpJump,
      dash,
      aimAngle: this.aimAngle,
      charging: this.mouseDown || this.gpCharge,
    };
  }

  get charging(): boolean {
    return this.mouseDown || this.gpCharge;
  }

  get gamepadConnected(): boolean {
    return this.gpConnected;
  }

  consumeRestart(): boolean {
    const r = this.restartQueued;
    this.restartQueued = false;
    return r;
  }

  /** True if Escape (or the pad Start button) was pressed since last call. */
  consumePauseToggle(): boolean {
    const p = this.pauseToggleQueued;
    this.pauseToggleQueued = false;
    return p;
  }

  /** Returns a 0-based weapon index if a number key was pressed since last call. */
  consumeWeaponSelect(): number | null {
    const w = this.weaponQueued;
    this.weaponQueued = null;
    return w;
  }

  /** Returns -1/+1 if a gamepad shoulder cycled weapons since last call, else 0. */
  consumeWeaponCycle(): number {
    const c = this.weaponCycleQueued;
    this.weaponCycleQueued = 0;
    return c;
  }
}
