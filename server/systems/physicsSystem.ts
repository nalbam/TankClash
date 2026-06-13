import { GRAVITY, VEHICLE, WORLD_WIDTH } from "../../shared/constants";
import { clamp, moveToward } from "../../shared/math";
import type { TerrainGrid } from "../../shared/terrain";
import type { WeaponDef } from "../../shared/weapons";
import type { PlayerState } from "../schema/PlayerState";
import type { ProjectileState } from "../schema/ProjectileState";

const MOVE_STEP = 0.25;

function isGrounded(p: PlayerState, terrain: TerrainGrid): boolean {
  return !terrain.boxFree(p.x, p.y - 0.1, VEHICLE.HALF_W * 0.95, VEHICLE.HALF_H);
}

/** Vehicle movement: acceleration, friction, gravity, jump, dash, slope step-up. */
export function stepVehicle(p: PlayerState, terrain: TerrainGrid, dt: number): void {
  const input = p.input;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  p.grounded = isGrounded(p, terrain);
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);

  // Horizontal control — heavier feel: accelerate toward max, friction at rest.
  const accel = p.grounded ? VEHICLE.ACCEL : VEHICLE.AIR_ACCEL;
  if (dir !== 0) {
    if (Math.abs(p.vx) <= VEHICLE.MAX_SPEED || Math.sign(p.vx) !== dir) {
      p.vx = clamp(p.vx + dir * accel * dt, -VEHICLE.MAX_SPEED, Math.max(VEHICLE.MAX_SPEED, Math.abs(p.vx)));
    }
  } else if (p.grounded) {
    p.vx = moveToward(p.vx, 0, VEHICLE.FRICTION * dt);
  }
  // Above max speed (dash/knockback): bleed back toward max.
  if (Math.abs(p.vx) > VEHICLE.MAX_SPEED) {
    p.vx = moveToward(p.vx, Math.sign(p.vx) * VEHICLE.MAX_SPEED, VEHICLE.FRICTION * 0.6 * dt);
  }

  if (input.dash && dir !== 0 && p.dashCooldown <= 0) {
    p.vx = dir * VEHICLE.DASH_SPEED;
    p.dashCooldown = VEHICLE.DASH_COOLDOWN;
  }

  if (input.jump && p.grounded) {
    p.vy = VEHICLE.JUMP_VELOCITY;
  }

  p.vy = Math.max(VEHICLE.MAX_FALL, p.vy + GRAVITY * dt);

  // Horizontal sweep with step-up (slope climbing).
  let remainingX = p.vx * dt;
  while (Math.abs(remainingX) > 1e-6) {
    const step = clamp(remainingX, -MOVE_STEP, MOVE_STEP);
    const nx = p.x + step;
    if (terrain.boxFree(nx, p.y, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
      p.x = nx;
    } else {
      let climbed = false;
      if (p.grounded) {
        for (let lift = MOVE_STEP; lift <= VEHICLE.STEP_UP + 1e-6; lift += MOVE_STEP) {
          if (terrain.boxFree(nx, p.y + lift, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
            p.x = nx;
            p.y += lift;
            climbed = true;
            break;
          }
        }
      }
      if (!climbed) {
        p.vx = 0;
        break;
      }
    }
    remainingX -= step;
  }

  // Vertical sweep.
  let remainingY = p.vy * dt;
  while (Math.abs(remainingY) > 1e-6) {
    const step = clamp(remainingY, -MOVE_STEP, MOVE_STEP);
    const ny = p.y + step;
    if (terrain.boxFree(p.x, ny, VEHICLE.HALF_W, VEHICLE.HALF_H)) {
      p.y = ny;
    } else {
      p.vy = 0;
      break;
    }
    remainingY -= step;
  }

  p.x = clamp(p.x, VEHICLE.HALF_W, WORLD_WIDTH - VEHICLE.HALF_W);
  p.grounded = isGrounded(p, terrain);
}

export interface ProjectileImpact {
  x: number;
  y: number;
  /** Session id of a directly-hit player, if any. */
  directHitId: string | null;
}

const VEHICLE_HIT_RADIUS = 1.9;

/**
 * Integrates a projectile one tick. Returns an impact when it hits terrain or
 * a vehicle, "out" when it leaves the world, or null while still flying.
 */
export function stepProjectile(
  proj: ProjectileState,
  def: WeaponDef,
  terrain: TerrainGrid,
  wind: number,
  players: Iterable<[string, PlayerState]>,
  dt: number,
): ProjectileImpact | "out" | null {
  proj.vx += wind * def.windInfluence * dt;
  proj.vy += GRAVITY * dt;

  const targets: Array<[string, PlayerState]> = [];
  for (const [id, p] of players) {
    if (p.alive && id !== proj.ownerId) targets.push([id, p]);
  }

  const dx = proj.vx * dt;
  const dy = proj.vy * dt;
  const length = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = proj.x + dx * t;
    const y = proj.y + dy * t;
    if (y < -30) return "out";
    for (const [id, p] of targets) {
      const ddx = x - p.x;
      const ddy = y - p.y;
      const r = VEHICLE_HIT_RADIUS + def.projectileRadius;
      if (ddx * ddx + ddy * ddy <= r * r) {
        return { x, y, directHitId: id };
      }
    }
    if (terrain.solidAtWorld(x, y)) {
      return { x, y, directHitId: null };
    }
  }

  proj.x += dx;
  proj.y += dy;
  return null;
}
