import { dist } from "../../shared/math";
import type { TerrainGrid } from "../../shared/terrain";
import type { CraterEvent } from "../../shared/types";
import type { WeaponDef } from "../../shared/weapons";
import type { GameState } from "../schema/GameState";
import type { SimEvents } from "../simEvents";
import { carveCrater } from "./terrainSystem";

/** Resolves an explosion: crater, splash damage with falloff, knockback, kills. */
export function applyExplosion(
  state: GameState,
  terrain: TerrainGrid,
  craters: CraterEvent[],
  events: SimEvents,
  x: number,
  y: number,
  def: WeaponDef,
  ownerId: string,
  directHitId: string | null,
): void {
  carveCrater(terrain, craters, events, x, y, def.craterRadius);
  events.explosions.push({ x, y, r: def.splashRadius, weapon: def.id });

  state.players.forEach((p, id) => {
    if (!p.alive) return;
    const d = dist(x, y, p.x, p.y);
    const direct = id === directHitId;
    if (d > def.splashRadius && !direct) return;

    const falloff = Math.max(0, 1 - d / def.splashRadius);
    let damage = def.damageMax * (direct ? Math.max(falloff, 0.85) : falloff);
    if (direct) damage += def.directBonus;
    if (id === ownerId) damage *= def.selfDamageScale;

    // Knockback away from the blast; near-zero distance pushes straight up.
    const impulse = def.knockback * Math.max(falloff, direct ? 0.85 : 0);
    let nx = (p.x - x) / (d || 1);
    let ny = (p.y - y) / (d || 1);
    if (d < 0.01) {
      nx = 0;
      ny = 1;
    }
    p.vx += nx * impulse;
    p.vy += ny * impulse + impulse * 0.35;

    p.health = Math.max(0, p.health - damage);
    if (p.health <= 0) {
      p.alive = false;
      p.charging = false;
      p.charge = 0;
      events.kills.push({ victimId: id, killerId: ownerId });
      if (ownerId !== id) {
        const killer = state.players.get(ownerId);
        if (killer) killer.kills += 1;
      }
    }
  });
}
