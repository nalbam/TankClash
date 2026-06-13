import { VEHICLE } from "../../shared/constants";
import { clamp } from "../../shared/math";
import { WEAPONS } from "../../shared/weapons";
import type { PlayerState } from "../schema/PlayerState";
import { ProjectileState } from "../schema/ProjectileState";
import type { GameState } from "../schema/GameState";
import type { SimEvents } from "../simEvents";

const MUZZLE_OFFSET = VEHICLE.HALF_W + 1.0;

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

  const proj = new ProjectileState();
  proj.weapon = def.id;
  proj.ownerId = playerId;
  proj.x = p.x + cos * MUZZLE_OFFSET;
  proj.y = p.y + 0.6 + sin * MUZZLE_OFFSET;
  proj.vx = cos * speed;
  proj.vy = sin * speed;
  state.projectiles.set(allocProjectileId(), proj);

  // Recoil.
  p.vx -= cos * def.knockback * 0.12;
  p.vy -= sin * def.knockback * 0.06;

  events.fired.push({
    playerId,
    weapon: def.id,
    x: proj.x,
    y: proj.y,
    angle: p.aimAngle,
    power,
  });
}
