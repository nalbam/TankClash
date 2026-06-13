import { GRAVITY } from "../../shared/constants";
import { clamp, createRng, dist, randRange } from "../../shared/math";
import type { PlayerInput } from "../../shared/types";
import { WEAPONS } from "../../shared/weapons";
import type { GameSim } from "../GameSim";
import type { PlayerState } from "../schema/PlayerState";

/**
 * Server-side bot. Produces the exact same PlayerInput a human client sends,
 * so it plays by identical rules.
 */
export class BotController {
  private rng: () => number;
  private input: PlayerInput = {
    seq: 0,
    left: false,
    right: false,
    jump: false,
    dash: false,
    aimAngle: 0,
    charging: false,
  };
  private moveDir = 0;
  private moveTimer = 0;
  private aimTimer = 0;
  private weaponTimer = 0;
  private desiredCharge = 0.5;
  private hasSolution = false;
  private stuckTimer = 0;
  private lastX = 0;

  constructor(readonly id: string, seed: number) {
    this.rng = createRng(seed >>> 0);
  }

  update(sim: GameSim, dt: number): PlayerInput {
    this.input.seq++;
    this.input.jump = false;
    this.input.dash = false;

    const me = sim.state.players.get(this.id);
    if (!me || !me.alive || sim.state.phase !== "playing") {
      this.input.left = false;
      this.input.right = false;
      this.input.charging = false;
      return this.input;
    }

    const enemy = this.nearestEnemy(sim, me);
    if (!enemy) {
      this.input.charging = false;
      return this.input;
    }

    this.updateWeapon(sim, me, enemy, dt);
    this.updateMovement(sim, me, enemy, dt);
    this.updateAim(sim, me, enemy, dt);
    this.updateFiring(me);

    return this.input;
  }

  /** Pick a weapon that fits the situation: range, cover, a little variety. */
  private updateWeapon(sim: GameSim, me: PlayerState, enemy: PlayerState, dt: number): void {
    this.weaponTimer -= dt;
    if (this.weaponTimer > 0 || me.charging) return;
    this.weaponTimer = randRange(this.rng, 2.5, 4.5);

    const range = Math.abs(enemy.x - me.x);
    const blocked = !this.lineOfSight(sim, me, enemy);
    let choice: string;
    if (range < 26) {
      choice = "shotgun";
    } else if (blocked) {
      choice = this.rng() < 0.5 ? "mortar" : "drill";
    } else if (this.rng() < 0.3) {
      choice = "cluster";
    } else {
      choice = "cannon";
    }
    sim.selectWeapon(this.id, choice);
  }

  /** Sample the straight line between tanks for blocking terrain. */
  private lineOfSight(sim: GameSim, me: PlayerState, enemy: PlayerState): boolean {
    const steps = 24;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = me.x + (enemy.x - me.x) * t;
      const y = me.y + (enemy.y - me.y) * t + 1;
      if (sim.terrain.solidAtWorld(x, y)) return false;
    }
    return true;
  }

  private nearestEnemy(sim: GameSim, me: PlayerState): PlayerState | null {
    let best: PlayerState | null = null;
    let bestD = Infinity;
    sim.state.players.forEach((p) => {
      if (!p.alive || p.team === me.team) return;
      const d = dist(me.x, me.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  private updateMovement(sim: GameSim, me: PlayerState, enemy: PlayerState, dt: number): void {
    this.moveTimer -= dt;

    // Dodge: flee predicted impact points of incoming projectiles.
    let dodge = 0;
    sim.state.projectiles.forEach((proj) => {
      if (proj.ownerId === this.id) return;
      const impact = predictLandingX(proj.x, proj.y, proj.vx, proj.vy, me.y);
      if (impact === null) return;
      const { x: landX, t } = impact;
      if (t < 1.3 && Math.abs(landX - me.x) < 9) {
        dodge = me.x >= landX ? 1 : -1;
      }
    });

    if (dodge !== 0) {
      this.moveDir = dodge;
      this.moveTimer = 0.4;
      if (this.rng() < 0.25) this.input.jump = true;
      if (this.rng() < 0.15) this.input.dash = true;
    } else if (this.moveTimer <= 0) {
      const dx = enemy.x - me.x;
      const range = Math.abs(dx);
      const lowHealth = me.health < 35;
      if (lowHealth && range < 60) {
        this.moveDir = -Math.sign(dx); // retreat toward cover
      } else if (range < 28) {
        this.moveDir = -Math.sign(dx);
      } else if (range > 75) {
        this.moveDir = Math.sign(dx);
      } else {
        const roll = this.rng();
        this.moveDir = roll < 0.4 ? 0 : roll < 0.7 ? 1 : -1;
      }
      this.moveTimer = randRange(this.rng, 0.6, 1.6);
    }

    // Stuck detection → jump.
    if (this.moveDir !== 0 && Math.abs(me.x - this.lastX) < 0.05) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.5) {
        this.input.jump = true;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = me.x;

    this.input.left = this.moveDir < 0;
    this.input.right = this.moveDir > 0;
  }

  private updateAim(sim: GameSim, me: PlayerState, enemy: PlayerState, dt: number): void {
    this.aimTimer -= dt;
    if (this.aimTimer > 0) return;
    this.aimTimer = randRange(this.rng, 1.2, 2.4);

    const def = WEAPONS[me.weapon];
    const solution = solveBallistic(
      enemy.x - me.x,
      enemy.y - me.y,
      def.minSpeed,
      def.maxSpeed,
      sim.state.wind * def.windInfluence,
      def.gravityScale,
    );

    if (!solution) {
      this.hasSolution = false;
      // Lob hopefully toward the enemy anyway.
      this.input.aimAngle = enemy.x >= me.x ? 1.0 : Math.PI - 1.0;
      this.desiredCharge = randRange(this.rng, 0.4, 0.9);
      this.hasSolution = this.rng() < 0.5;
      return;
    }

    // Imperfection: bots occasionally miss.
    const angleNoise = randRange(this.rng, -0.06, 0.06);
    const chargeNoise = randRange(this.rng, -0.05, 0.05);
    this.input.aimAngle = clamp(solution.angle + angleNoise, -Math.PI, Math.PI);
    this.desiredCharge = clamp(
      (solution.speed - def.minSpeed) / (def.maxSpeed - def.minSpeed) + chargeNoise,
      0.05,
      1,
    );
    this.hasSolution = true;
  }

  private updateFiring(me: PlayerState): void {
    if (!this.hasSolution || me.cooldown > 0) {
      this.input.charging = false;
      return;
    }
    if (me.charging && me.charge >= this.desiredCharge) {
      this.input.charging = false; // release → fire
      this.hasSolution = false;
    } else {
      this.input.charging = true;
    }
  }
}

/** Predicts where a ballistic projectile crosses height yTarget (descending). */
function predictLandingX(
  x: number,
  y: number,
  vx: number,
  vy: number,
  yTarget: number,
): { x: number; t: number } | null {
  const g = GRAVITY; // negative
  // y + vy t + 0.5 g t^2 = yTarget
  const a = 0.5 * g;
  const b = vy;
  const c = y - yTarget;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-b + sqrt) / (2 * a);
  const t2 = (-b - sqrt) / (2 * a);
  const t = Math.max(t1, t2);
  if (!Number.isFinite(t) || t <= 0) return null;
  return { x: x + vx * t, t };
}

/**
 * Finds an angle/speed pair to hit (dx, dy) under gravity, scanning launch
 * angles and picking the lowest feasible speed. Wind is roughly compensated
 * by biasing the angle.
 */
function solveBallistic(
  dx: number,
  dy: number,
  minSpeed: number,
  maxSpeed: number,
  wind: number,
  gravityScale: number,
): { angle: number; speed: number } | null {
  // Match the projectile's actual gravity so flat (drill) and lobbed (mortar)
  // weapons are aimed correctly. Scan low angles too for near-direct fire.
  const g = -GRAVITY * gravityScale;
  const dir = Math.sign(dx) || 1;
  const adx = Math.abs(dx);
  for (let deg = 12; deg <= 75; deg += 3) {
    const theta = (deg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const tan = Math.tan(theta);
    const denom = 2 * cos * cos * (adx * tan - dy * dir * dir);
    if (denom <= 0) continue;
    const v2 = (g * adx * adx) / denom;
    if (v2 <= 0) continue;
    const v = Math.sqrt(v2);
    if (v < minSpeed || v > maxSpeed * 0.97) continue;
    let angle = dir > 0 ? theta : Math.PI - theta;
    // Crude wind lead: tilt slightly against the wind.
    angle -= clamp(wind * 0.012, -0.12, 0.12) * dir;
    return { angle, speed: v };
  }
  return null;
}
