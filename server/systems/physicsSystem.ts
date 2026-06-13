import { GRAVITY } from "../../shared/constants";
import type { TerrainGrid } from "../../shared/terrain";
import type { WeaponDef } from "../../shared/weapons";
import type { PlayerState } from "../schema/PlayerState";
import type { ProjectileState } from "../schema/ProjectileState";

export { stepVehicle } from "../../shared/physics";

export interface ProjectileImpact {
  x: number;
  y: number;
  /** Session id of a directly-hit player, if any. */
  directHitId: string | null;
}

/** Drill tunneling through terrain this tick; caller carves and counts down. */
export interface ProjectilePierce {
  pierce: true;
  x: number;
  y: number;
}

const VEHICLE_HIT_RADIUS = 1.9;

function hitTarget(
  x: number,
  y: number,
  def: WeaponDef,
  targets: Array<[string, PlayerState]>,
): string | null {
  for (const [id, p] of targets) {
    const ddx = x - p.x;
    const ddy = y - p.y;
    const r = VEHICLE_HIT_RADIUS + def.projectileRadius;
    if (ddx * ddx + ddy * ddy <= r * r) return id;
  }
  return null;
}

/**
 * Integrates a projectile one tick. Returns an impact when it hits terrain or
 * a vehicle, a pierce when a drill bores through terrain, "out" when it leaves
 * the world, or null while still flying.
 */
export function stepProjectile(
  proj: ProjectileState,
  def: WeaponDef,
  terrain: TerrainGrid,
  wind: number,
  players: Iterable<[string, PlayerState]>,
  dt: number,
): ProjectileImpact | ProjectilePierce | "out" | null {
  proj.vx += wind * def.windInfluence * dt;
  proj.vy += GRAVITY * def.gravityScale * dt;

  const targets: Array<[string, PlayerState]> = [];
  for (const [id, p] of players) {
    if (p.alive && id !== proj.ownerId) targets.push([id, p]);
  }

  const dx = proj.vx * dt;
  const dy = proj.vy * dt;
  const length = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  const drilling = def.pierce !== undefined && proj.pierceLeft > 0;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = proj.x + dx * t;
    const y = proj.y + dy * t;
    if (y < -30) return "out";

    const hit = hitTarget(x, y, def, targets);
    if (hit) return { x, y, directHitId: hit };

    if (terrain.solidAtWorld(x, y)) {
      // A drill bores through instead of detonating, until pierce is spent.
      if (drilling) {
        proj.x = x;
        proj.y = y;
        return { pierce: true, x, y };
      }
      return { x, y, directHitId: null };
    }
  }

  proj.x += dx;
  proj.y += dy;
  return null;
}
