import { GRAVITY, VEHICLE, WORLD_WIDTH } from "./constants";
import { clamp, moveToward } from "./math";
import type { TerrainGrid } from "./terrain";
import type { PlayerInput } from "./types";

const MOVE_STEP = 0.25;

/**
 * Minimal vehicle physics surface. The server's PlayerState schema satisfies
 * this shape, and the client's local-prediction body implements it directly,
 * so identical movement code runs on both sides (clean prediction foundation).
 */
export interface VehicleBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  dashCooldown: number;
  input: PlayerInput;
}

export function isGrounded(b: VehicleBody, terrain: TerrainGrid): boolean {
  return !terrain.boxFree(b.x, b.y - 0.1, VEHICLE.HALF_W * 0.95, VEHICLE.HALF_H);
}

/** Vehicle movement: acceleration, friction, gravity, jump, dash, slope step-up. */
export function stepVehicle(b: VehicleBody, terrain: TerrainGrid, dt: number): void {
  const input = b.input;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  b.grounded = isGrounded(b, terrain);
  b.dashCooldown = Math.max(0, b.dashCooldown - dt);

  // Horizontal control — heavier feel: accelerate toward max, friction at rest.
  const accel = b.grounded ? VEHICLE.ACCEL : VEHICLE.AIR_ACCEL;
  if (dir !== 0) {
    if (Math.abs(b.vx) <= VEHICLE.MAX_SPEED || Math.sign(b.vx) !== dir) {
      b.vx = clamp(b.vx + dir * accel * dt, -VEHICLE.MAX_SPEED, Math.max(VEHICLE.MAX_SPEED, Math.abs(b.vx)));
    }
  } else if (b.grounded) {
    b.vx = moveToward(b.vx, 0, VEHICLE.FRICTION * dt);
  }
  // Above max speed (dash/knockback): bleed back toward max.
  if (Math.abs(b.vx) > VEHICLE.MAX_SPEED) {
    b.vx = moveToward(b.vx, Math.sign(b.vx) * VEHICLE.MAX_SPEED, VEHICLE.FRICTION * 0.6 * dt);
  }

  if (input.dash && dir !== 0 && b.dashCooldown <= 0) {
    b.vx = dir * VEHICLE.DASH_SPEED;
    b.dashCooldown = VEHICLE.DASH_COOLDOWN;
  }

  if (input.jump && b.grounded) {
    b.vy = VEHICLE.JUMP_VELOCITY;
  }

  b.vy = Math.max(VEHICLE.MAX_FALL, b.vy + GRAVITY * dt);

  // Horizontal sweep with step-up (slope climbing).
  let remainingX = b.vx * dt;
  while (Math.abs(remainingX) > 1e-6) {
    const step = clamp(remainingX, -MOVE_STEP, MOVE_STEP);
    const nx = b.x + step;
    if (terrain.boxFree(nx, b.y, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
      b.x = nx;
    } else {
      let climbed = false;
      if (b.grounded) {
        for (let lift = MOVE_STEP; lift <= VEHICLE.STEP_UP + 1e-6; lift += MOVE_STEP) {
          if (terrain.boxFree(nx, b.y + lift, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
            b.x = nx;
            b.y += lift;
            climbed = true;
            break;
          }
        }
      }
      if (!climbed) {
        b.vx = 0;
        break;
      }
    }
    remainingX -= step;
  }

  // Vertical sweep.
  let remainingY = b.vy * dt;
  while (Math.abs(remainingY) > 1e-6) {
    const step = clamp(remainingY, -MOVE_STEP, MOVE_STEP);
    const ny = b.y + step;
    if (terrain.boxFree(b.x, ny, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
      b.y = ny;
    } else {
      b.vy = 0;
      break;
    }
    remainingY -= step;
  }

  b.x = clamp(b.x, VEHICLE.HALF_W, WORLD_WIDTH - VEHICLE.HALF_W);
  b.grounded = isGrounded(b, terrain);
}
