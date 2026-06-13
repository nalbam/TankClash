import { FIXED_DT, PLAYER_MAX_HEALTH, VEHICLE, WORLD_WIDTH } from "../shared/constants";
import { clamp, createRng, randRange } from "../shared/math";
import { TerrainGrid } from "../shared/terrain";
import type { CraterEvent, PlayerInput, TeamId } from "../shared/types";
import { WEAPONS, type WeaponDef } from "../shared/weapons";
import { GameState } from "./schema/GameState";
import { PlayerState } from "./schema/PlayerState";
import type { ProjectileState } from "./schema/ProjectileState";
import { createSimEvents, type SimEvents } from "./simEvents";
import { applyExplosion, stepStatus } from "./systems/damageSystem";
import { stepMatch, type MatchRuntime } from "./systems/matchSystem";
import { stepProjectile, stepVehicle } from "./systems/physicsSystem";
import { spawnProjectile, stepWeapon } from "./systems/weaponSystem";
import { carveCrater } from "./systems/terrainSystem";
import { stepWind, type WindRuntime } from "./systems/windSystem";

/**
 * Authoritative game simulation. Pure of any networking concern so the same
 * code drives the Colyseus room and the headless verification harness.
 */
export class GameSim {
  readonly state = new GameState();
  terrain: TerrainGrid;
  /** Full crater history of the current round (for late joiners). */
  craters: CraterEvent[] = [];
  events: SimEvents = createSimEvents();

  private rng: () => number;
  private wind: WindRuntime = { target: 0, timer: 0 };
  private match: MatchRuntime = { endTimer: 0, wantsRestart: false };
  private nextProjId = 1;
  private joinCounter = 0;

  constructor(seed: number) {
    this.rng = createRng(seed >>> 0);
    this.state.terrainSeed = seed >>> 0;
    this.terrain = TerrainGrid.generate(this.state.terrainSeed);
  }

  addPlayer(id: string, name: string, isBot: boolean): PlayerState {
    const p = new PlayerState();
    p.name = name;
    p.isBot = isBot;
    p.team = (this.joinCounter++ % 2 === 0 ? "blue" : "red") as TeamId;
    this.state.players.set(id, p);
    this.spawnPlayer(p);
    return p;
  }

  removePlayer(id: string): void {
    this.state.players.delete(id);
  }

  /** Network boundary: coerce and bound everything coming from clients. */
  setInput(id: string, raw: unknown): void {
    const p = this.state.players.get(id);
    if (!p || typeof raw !== "object" || raw === null) return;
    const m = raw as Record<string, unknown>;
    const aim = Number(m.aimAngle);
    const seq = Number(m.seq);
    const input: PlayerInput = {
      seq: Number.isFinite(seq) ? seq : p.input.seq,
      left: m.left === true,
      right: m.right === true,
      jump: m.jump === true,
      dash: m.dash === true,
      aimAngle: Number.isFinite(aim) ? clamp(aim, -Math.PI, Math.PI) : p.input.aimAngle,
      charging: m.charging === true,
    };
    p.input = input;
    p.lastSeq = input.seq;
  }

  tick(dt: number = FIXED_DT): void {
    stepWind(this.state, this.wind, this.rng, dt);

    if (this.state.phase === "playing") {
      this.state.players.forEach((p, id) => {
        if (!p.alive) return;
        stepStatus(this.state, this.events, p, id, dt);
        if (!p.alive) return; // burn may have killed this tick
        stepWeapon(this.state, this.events, id, p, () => `p${this.nextProjId++}`, dt);
        stepVehicle(p, this.terrain, dt);
      });

      const toRemove: string[] = [];
      this.state.projectiles.forEach((proj, id) => {
        const def = WEAPONS[proj.weapon];
        const result = stepProjectile(
          proj,
          def,
          this.terrain,
          this.state.wind,
          this.state.players.entries(),
          dt,
        );
        if (result === "out") {
          toRemove.push(id);
        } else if (result && "pierce" in result) {
          // Drill bores a tunnel and keeps flying until pierce is spent.
          carveCrater(this.terrain, this.craters, this.events, result.x, result.y, def.pierceRadius ?? 1.5);
          proj.pierceLeft -= 1;
          if (proj.pierceLeft <= 0) {
            this.detonate(proj, def, result.x, result.y, null);
            toRemove.push(id);
          }
        } else if (result) {
          this.detonate(proj, def, result.x, result.y, result.directHitId);
          toRemove.push(id);
        }
      });
      for (const id of toRemove) this.state.projectiles.delete(id);
    }

    stepMatch(this.state, this.match, this.events, dt);
    if (this.match.wantsRestart) {
      this.match.wantsRestart = false;
      this.resetRound();
    }
  }

  /** Explosion + optional cluster split into child projectiles. */
  private detonate(
    proj: ProjectileState,
    def: WeaponDef,
    x: number,
    y: number,
    directHitId: string | null,
  ): void {
    applyExplosion(this.state, this.terrain, this.craters, this.events, x, y, def, proj.ownerId, directHitId);

    const split = def.splitOnImpact;
    if (!split) return;
    const childDef = WEAPONS[split.weapon];
    if (!childDef) return;
    for (let i = 0; i < split.count; i++) {
      // Deterministic upward fan so bomblets scatter without RNG.
      const spread = (i / Math.max(1, split.count - 1) - 0.5) * 1.5;
      const angle = Math.PI * 0.5 + spread;
      const speedScale = 0.7 + 0.3 * (1 - Math.abs(spread));
      spawnProjectile(
        this.state,
        childDef,
        proj.ownerId,
        x,
        y + 0.6,
        angle,
        split.speed * speedScale,
        () => `p${this.nextProjId++}`,
      );
    }
  }

  /** Switch the active weapon (ignored mid-charge or for non-selectable ids). */
  selectWeapon(id: string, weaponId: string): void {
    const p = this.state.players.get(id);
    if (!p || !p.alive || p.charging) return;
    const def = WEAPONS[weaponId];
    if (!def || !def.selectable) return;
    p.weapon = weaponId;
  }

  /** Player-initiated restart from the win screen. */
  requestRestart(): void {
    if (this.state.phase === "ended") this.match.wantsRestart = true;
  }

  drainEvents(): SimEvents {
    const drained = this.events;
    this.events = createSimEvents();
    return drained;
  }

  private resetRound(): void {
    this.state.terrainSeed = (this.state.terrainSeed + 0x1f3) >>> 0;
    this.terrain = TerrainGrid.generate(this.state.terrainSeed);
    this.craters = [];
    this.state.projectiles.forEach((_, id) => this.state.projectiles.delete(id));
    this.state.roundTime = 0;
    this.state.winnerTeam = "";
    this.state.wind = randRange(this.rng, -3, 3);
    this.wind.timer = 0;

    this.state.players.forEach((p) => this.spawnPlayer(p));
    this.state.phase = this.state.players.size >= 2 ? "playing" : "waiting";
  }

  private spawnPlayer(p: PlayerState): void {
    const baseX = p.team === "blue" ? WORLD_WIDTH * 0.18 : WORLD_WIDTH * 0.82;
    const x = clamp(baseX + randRange(this.rng, -8, 8), VEHICLE.HALF_W + 2, WORLD_WIDTH - VEHICLE.HALF_W - 2);
    p.x = x;
    p.y = this.terrain.surfaceY(x) + VEHICLE.HALF_H + 0.2;
    p.vx = 0;
    p.vy = 0;
    p.health = PLAYER_MAX_HEALTH;
    p.alive = true;
    p.charge = 0;
    p.charging = false;
    p.cooldown = 0;
    p.shieldTime = 0;
    p.burnTime = 0;
    p.burnOwnerId = "";
    p.aimAngle = p.team === "blue" ? 0.8 : Math.PI - 0.8;
    p.input = {
      seq: p.input?.seq ?? 0,
      left: false,
      right: false,
      jump: false,
      dash: false,
      aimAngle: p.aimAngle,
      charging: false,
    };
  }
}
