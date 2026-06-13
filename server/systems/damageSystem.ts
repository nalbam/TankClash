import { PLAYER_MAX_HEALTH, STATUS } from "../../shared/constants";
import { dist } from "../../shared/math";
import type { TerrainGrid } from "../../shared/terrain";
import type { CraterEvent } from "../../shared/types";
import type { WeaponDef } from "../../shared/weapons";
import type { GameState } from "../schema/GameState";
import type { PlayerState } from "../schema/PlayerState";
import type { SimEvents } from "../simEvents";
import { carveCrater } from "./terrainSystem";

function killPlayer(state: GameState, events: SimEvents, p: PlayerState, id: string, killerId: string): void {
  p.alive = false;
  p.charging = false;
  p.charge = 0;
  p.burnTime = 0;
  p.shieldTime = 0;
  events.kills.push({ victimId: id, killerId });
  if (killerId !== id) {
    const killer = state.players.get(killerId);
    if (killer) killer.kills += 1;
  }
}

/**
 * Resolves an explosion. Standard weapons deal splash damage with falloff,
 * knockback (or inward pull for gravity), and optional burn. Team-support
 * weapons (shield/repair) instead buff allies in the radius and ignore enemies.
 */
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
  if (def.craterRadius > 0) carveCrater(terrain, craters, events, x, y, def.craterRadius);
  events.explosions.push({ x, y, r: def.splashRadius, weapon: def.id });

  const ownerTeam = state.players.get(ownerId)?.team;

  state.players.forEach((p, id) => {
    if (!p.alive) return;
    const d = dist(x, y, p.x, p.y);
    const direct = id === directHitId;
    if (d > def.splashRadius && !direct) return;
    const falloff = Math.max(0, 1 - d / def.splashRadius);

    // Team support: buff allies (including the owner), never touch enemies.
    if (def.teamSupport) {
      if (p.team !== ownerTeam) return;
      const potency = Math.max(falloff, direct ? 0.85 : 0.4);
      if (def.teamSupport.shieldDuration) {
        p.shieldTime = Math.max(p.shieldTime, def.teamSupport.shieldDuration);
      }
      if (def.teamSupport.heal) {
        p.health = Math.min(PLAYER_MAX_HEALTH, p.health + def.teamSupport.heal * potency);
      }
      return;
    }

    let damage = def.damageMax * (direct ? Math.max(falloff, 0.85) : falloff);
    if (direct) damage += def.directBonus;
    if (id === ownerId) damage *= def.selfDamageScale;
    if (p.shieldTime > 0) damage *= 1 - STATUS.SHIELD_REDUCTION;

    // Knockback away from the blast — or inward for a gravity bomb.
    const impulse = def.knockback * Math.max(falloff, direct ? 0.85 : 0);
    let nx = (p.x - x) / (d || 1);
    let ny = (p.y - y) / (d || 1);
    if (d < 0.01) {
      nx = 0;
      ny = 1;
    }
    if (def.pull) {
      p.vx -= nx * impulse;
      p.vy -= ny * impulse;
    } else {
      p.vx += nx * impulse;
      p.vy += ny * impulse + impulse * 0.35;
    }

    // Napalm ignites enemies (not the owner).
    if (def.burnDuration && id !== ownerId) {
      p.burnTime = Math.max(p.burnTime, def.burnDuration);
      p.burnOwnerId = ownerId;
    }

    p.health = Math.max(0, p.health - damage);
    if (p.health <= 0) killPlayer(state, events, p, id, ownerId);
  });
}

/** Per-tick status effects: shield decay and burn damage-over-time. */
export function stepStatus(state: GameState, events: SimEvents, p: PlayerState, id: string, dt: number): void {
  if (p.shieldTime > 0) p.shieldTime = Math.max(0, p.shieldTime - dt);
  if (p.burnTime > 0) {
    p.burnTime = Math.max(0, p.burnTime - dt);
    p.health = Math.max(0, p.health - STATUS.BURN_DPS * dt);
    if (p.health <= 0) killPlayer(state, events, p, id, p.burnOwnerId || id);
  }
}
