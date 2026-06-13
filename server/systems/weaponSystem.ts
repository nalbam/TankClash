import { VEHICLE } from "../../shared/constants";
import { clamp } from "../../shared/math";
import { WEAPONS, type WeaponDef } from "../../shared/weapons";
import type { PlayerState } from "../schema/PlayerState";
import { ProjectileState } from "../schema/ProjectileState";
import type { GameState } from "../schema/GameState";
import type { SimEvents } from "../simEvents";

const MUZZLE_OFFSET = VEHICLE.HALF_W + 1.0;

export function spawnProjectile(
  state: GameState,
  def: WeaponDef,
  ownerId: string,
  x: number,
  y: number,
  angle: number,
  speed: number,
  allocProjectileId: () => string,
): void {
  const proj = new ProjectileState();
  proj.weapon = def.id;
  proj.ownerId = ownerId;
  proj.x = x;
  proj.y = y;
  proj.vx = Math.cos(angle) * speed;
  proj.vy = Math.sin(angle) * speed;
  proj.pierceLeft = def.pierce ?? 0;
  state.projectiles.set(allocProjectileId(), proj);
}

/** Charge/release firing. Power is computed server-side from hold duration. */
export function stepWeapon(
  state: GameState,
  events: SimEvents,
  playerId: string,
  p: PlayerState,
  allocProjectileId: () => string,
  dt: number,
): void {
  p.cooldown = Math.max(0, p.cooldown - dt);
  const def = WEAPONS[p.weapon];
  if (!def || !p.alive) return;

  p.aimAngle = p.input.aimAngle;

  if (p.input.charging) {
    if (p.cooldown <= 0) {
      p.charging = true;
      p.charge = clamp(p.charge + dt / def.chargeTime, 0, 1);
    }
    return;
  }

  if (!p.charging) return;

  // Release → fire.
  const power = p.charge;
  p.charging = false;
  p.charge = 0;
  p.cooldown = def.cooldown;

  const speed = def.minSpeed + (def.maxSpeed - def.minSpeed) * power;
  const cos = Math.cos(p.aimAngle);
  const sin = Math.sin(p.aimAngle);
  const muzzleX = p.x + cos * MUZZLE_OFFSET;
  const muzzleY = p.y + 0.6 + sin * MUZZLE_OFFSET;

  // Shotgun fires a deterministic spread cone; everything else a single shot.
  const pellets = def.pellets ?? 1;
  const spread = def.spread ?? 0;
  for (let i = 0; i < pellets; i++) {
    const offset = pellets > 1 ? (i / (pellets - 1) - 0.5) * 2 * spread : 0;
    spawnProjectile(state, def, playerId, muzzleX, muzzleY, p.aimAngle + offset, speed, allocProjectileId);
  }

  // Recoil.
  p.vx -= cos * def.knockback * 0.12;
  p.vy -= sin * def.knockback * 0.06;

  events.fired.push({
    playerId,
    weapon: def.id,
    x: muzzleX,
    y: muzzleY,
    angle: p.aimAngle,
    power,
  });
}
