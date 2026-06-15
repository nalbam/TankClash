import { FIXED_DT } from "@shared/constants";
import { isGrounded, stepVehicle, type VehicleBody } from "@shared/physics";
import type { TerrainGrid } from "@shared/terrain";
import type { PlayerInput } from "@shared/types";
import type { PlayerView } from "./colyseusClient";

const HARD_SNAP_DIST = 14; // server/predict divergence that forces a hard reset

/**
 * Client-side prediction for the local tank: applies input immediately for
 * zero-latency movement, then reconciles against each authoritative server
 * snapshot by replaying still-unacknowledged inputs. Foundation for rollback.
 */
export class LocalPredictor {
  readonly body: VehicleBody = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    grounded: false,
    dashCooldown: 0,
    tilt: 0,
    input: { seq: 0, left: false, right: false, jump: false, dash: false, aimAngle: 0, charging: false },
  };
  active = false;

  private pending: Array<{ seq: number; input: PlayerInput }> = [];

  /** Hard reset to an authoritative view (spawn / respawn / first sync). */
  reset(view: PlayerView): void {
    this.body.x = view.x;
    this.body.y = view.y;
    this.body.vx = view.vx;
    this.body.vy = view.vy;
    this.body.tilt = view.tilt;
    this.body.dashCooldown = 0;
    this.pending = [];
    this.active = true;
  }

  /** Apply a freshly-sampled input locally and remember it for replay. */
  applyInput(input: PlayerInput, terrain: TerrainGrid): void {
    if (!this.active) return;
    this.pending.push({ seq: input.seq, input });
    if (this.pending.length > 120) this.pending.shift();
    this.body.input = input;
    stepVehicle(this.body, terrain, FIXED_DT);
  }

  /**
   * Reconcile against the latest server state: drop acknowledged inputs, snap
   * to the authoritative position, then replay the rest. Large divergence
   * (death/teleport) triggers a hard reset instead.
   */
  reconcile(view: PlayerView, terrain: TerrainGrid): void {
    if (!this.active) return;
    this.pending = this.pending.filter((p) => p.seq > view.lastSeq);

    const drift = Math.hypot(view.x - this.body.x, view.y - this.body.y);
    if (drift > HARD_SNAP_DIST) {
      this.reset(view);
      return;
    }

    this.body.x = view.x;
    this.body.y = view.y;
    this.body.vx = view.vx;
    this.body.vy = view.vy;
    this.body.grounded = isGrounded(this.body, terrain);
    for (const p of this.pending) {
      this.body.input = p.input;
      stepVehicle(this.body, terrain, FIXED_DT);
    }
  }
}
