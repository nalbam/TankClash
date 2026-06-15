import { FIXED_DT, MATCH, PLAYER_MAX_HEALTH, VEHICLE, WORLD_WIDTH } from "../shared/constants";
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

/** Spawn jitter (world units) — must stay within the flattened landing pad. */
export const SPAWN_JITTER = 3;
/** Horizontal gap between teammates' spawns (world units); keep within the pad. */
export const TEAM_SPAWN_SPACING = 6;

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

  /** Networked rooms run host-driven lobbies; the headless sim auto-starts. */
  readonly lobbyMode: boolean;
  /** Fighters to keep per match (humans + bots): 2 for 1v1, 4 for 2v2. */
  readonly fillTo: number;

  private rng: () => number;
  private wind: WindRuntime = { target: 0, timer: 0 };
  private match: MatchRuntime;
  private nextProjId = 1;
  private joinCounter = 0;

  constructor(seed: number, opts: { lobbyMode?: boolean; fillTo?: number } = {}) {
    this.lobbyMode = opts.lobbyMode === true;
    this.fillTo = opts.fillTo ?? 2;
    this.match = { endTimer: 0, wantsRestart: false, wantsLobby: false, lobbyMode: this.lobbyMode };
    this.rng = createRng(seed >>> 0);
    this.state.terrainSeed = seed >>> 0;
    this.terrain = TerrainGrid.generate(this.state.terrainSeed);
    if (this.lobbyMode) this.state.phase = "lobby";
  }

  addPlayer(id: string, name: string, isBot: boolean, spectator = false, forceTeam?: TeamId): PlayerState {
    const p = new PlayerState();
    p.name = name;
    p.isBot = isBot;
    p.spectator = spectator;
    if (spectator) {
      p.team = "blue";
      p.alive = false;
      this.state.players.set(id, p);
      return p;
    }
    // Lobby mode balances onto the smaller team; the headless path alternates.
    p.team = forceTeam ?? (this.lobbyMode ? this.smallerTeam() : ((this.joinCounter++ % 2 === 0 ? "blue" : "red") as TeamId));
    this.state.players.set(id, p);
    this.spawnPlayer(p);
    if (this.lobbyMode && !isBot && !this.state.hostId) this.state.hostId = id;
    return p;
  }

  removePlayer(id: string): void {
    const wasHost = this.state.hostId === id;
    this.state.players.delete(id);
    if (wasHost) this.reassignHost();
  }

  /** The team with fewer fighters (ties → blue), for balanced auto-assignment. */
  private smallerTeam(): TeamId {
    let blue = 0;
    let red = 0;
    this.state.players.forEach((p) => {
      if (p.spectator) return;
      if (p.team === "blue") blue++;
      else red++;
    });
    return red < blue ? "red" : "blue";
  }

  /** Count fighters (non-spectators) currently on a team. */
  teamFighters(team: TeamId, excludeId?: string): number {
    let n = 0;
    this.state.players.forEach((p, id) => {
      if (!p.spectator && p.team === team && id !== excludeId) n++;
    });
    return n;
  }

  /** Count human (non-bot) fighters on a team. */
  humanFighters(team: TeamId, excludeId?: string): number {
    let n = 0;
    this.state.players.forEach((p, id) => {
      if (!p.spectator && !p.isBot && p.team === team && id !== excludeId) n++;
    });
    return n;
  }

  /** Total fighters across both teams. */
  fighterCount(): number {
    let n = 0;
    this.state.players.forEach((p) => {
      if (!p.spectator) n++;
    });
    return n;
  }

  /** Hand the host role to another human (preferring an active fighter). */
  private reassignHost(): void {
    let fallback = "";
    let next = "";
    this.state.players.forEach((p, id) => {
      if (p.isBot) return;
      if (!fallback) fallback = id;
      if (!next && !p.spectator) next = id;
    });
    this.state.hostId = next || fallback;
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
      // Wrap (not clamp) to the equivalent angle in (-π, π] so an un-normalized
      // angle from a client maps to the correct direction instead of being pinned.
      aimAngle: Number.isFinite(aim) ? Math.atan2(Math.sin(aim), Math.cos(aim)) : p.input.aimAngle,
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
    if (this.match.wantsLobby) {
      this.match.wantsLobby = false;
      this.returnToLobby();
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

  /** Switch the active weapon (ignored outside play, mid-charge, or non-selectable ids). */
  selectWeapon(id: string, weaponId: string): void {
    if (this.state.phase !== "playing") return;
    const p = this.state.players.get(id);
    if (!p || !p.alive || p.charging) return;
    const def = WEAPONS[weaponId];
    if (!def || !def.selectable) return;
    p.weapon = weaponId;
  }

  /** Player-initiated restart from the win screen. */
  requestRestart(): void {
    if (this.state.phase !== "ended") return;
    // Lobby rooms go back to the lobby; the headless/solo path restarts directly.
    if (this.lobbyMode) this.match.wantsLobby = true;
    else this.match.wantsRestart = true;
  }

  // ── Lobby commands (no-ops outside lobby mode) ──────────────────────────────

  /** Toggle a fighter's ready flag (lobby phase only). */
  setReady(id: string, ready: boolean): void {
    if (!this.lobbyMode || this.state.phase !== "lobby") return;
    const p = this.state.players.get(id);
    if (!p || p.isBot || p.spectator) return;
    p.ready = ready === true;
  }

  /**
   * Switch a player onto a team during the lobby. A team that is already full of
   * humans (cap = fillTo / 2) is rejected; otherwise the player joins and a bot
   * is later reconciled off that team by the room.
   */
  selectTeam(id: string, team: unknown): void {
    if (!this.lobbyMode || this.state.phase !== "lobby") return;
    if (team !== "blue" && team !== "red") return;
    const p = this.state.players.get(id);
    if (!p || p.isBot) return;
    const cap = Math.max(1, Math.floor(this.fillTo / 2));
    if (this.humanFighters(team, id) >= cap) return; // side already full of humans
    p.spectator = false;
    p.team = team;
    p.ready = false;
    this.spawnPlayer(p);
    if (!this.state.hostId) this.state.hostId = id;
  }

  /**
   * Toggle spectator. `true` drops to watching — and in a live match that means
   * the tank dies (self-kill in the feed). `false` rejoins a team in the lobby.
   * Leaving is locked during the countdown.
   */
  setSpectator(id: string, spectate: boolean): void {
    if (!this.lobbyMode) return;
    const p = this.state.players.get(id);
    if (!p || p.isBot) return;

    if (spectate === true) {
      if (p.spectator) return;
      if (this.state.phase === "countdown") return; // can't bail mid-countdown
      if (this.state.phase === "playing" && p.alive) {
        p.alive = false;
        p.health = 0;
        this.events.kills.push({ victimId: id, killerId: id }); // "left the fight" death
      }
      p.spectator = true;
      p.ready = false;
      if (this.state.hostId === id) this.reassignHost();
      return;
    }

    // Rejoin as a fighter — only meaningful while in the lobby.
    if (this.state.phase !== "lobby" || !p.spectator) return;
    const cap = Math.max(1, Math.floor(this.fillTo / 2));
    if (this.humanFighters("blue") >= cap && this.humanFighters("red") >= cap) return; // no human slot
    p.spectator = false;
    p.team = this.smallerTeam();
    p.ready = false;
    this.spawnPlayer(p);
    if (!this.state.hostId) this.state.hostId = id;
  }

  /** Host starts the match: 3 s if every human is ready, else 10 s. */
  requestStart(id: string): void {
    if (!this.lobbyMode || this.state.phase !== "lobby") return;
    if (id !== this.state.hostId) return;
    if (this.fighterCount() < 2) return;
    let allReady = true;
    this.state.players.forEach((p) => {
      if (!p.spectator && !p.isBot && !p.ready) allReady = false;
    });
    this.state.countdown = allReady ? MATCH.COUNTDOWN_ALL_READY_S : MATCH.COUNTDOWN_DEFAULT_S;
    this.state.phase = "countdown";
  }

  /** A connection dropped mid-match: register the death so the feed reflects it. */
  notifyLeaveDuringMatch(id: string): void {
    const p = this.state.players.get(id);
    if (!p || p.spectator || !p.alive) return;
    if (this.state.phase === "playing" || this.state.phase === "countdown") {
      this.events.kills.push({ victimId: id, killerId: id });
    }
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
    this.state.countdown = 0;
    this.state.wind = randRange(this.rng, -3, 3);
    this.wind.timer = 0;

    this.state.players.forEach((p) => {
      if (!p.spectator) this.spawnPlayer(p);
    });
    const fighters = this.fighterCount();
    this.state.phase = fighters >= 2 ? "playing" : this.lobbyMode ? "lobby" : "waiting";
  }

  /** Lobby mode: after a match ends, return to the lobby and clear ready flags. */
  private returnToLobby(): void {
    this.state.projectiles.forEach((_, id) => this.state.projectiles.delete(id));
    this.state.roundTime = 0;
    this.state.winnerTeam = "";
    this.state.countdown = 0;
    this.state.players.forEach((p) => {
      p.ready = false;
    });
    this.state.phase = "lobby";
  }

  private spawnPlayer(p: PlayerState): void {
    // Spread teammates apart along the pad; a lone fighter gets random jitter.
    const mates: PlayerState[] = [];
    this.state.players.forEach((q) => {
      if (!q.spectator && q.team === p.team) mates.push(q);
    });
    const idx = Math.max(0, mates.indexOf(p));
    const offset =
      mates.length > 1
        ? (idx - (mates.length - 1) / 2) * TEAM_SPAWN_SPACING
        : randRange(this.rng, -SPAWN_JITTER, SPAWN_JITTER);
    const baseX = p.team === "blue" ? WORLD_WIDTH * 0.18 : WORLD_WIDTH * 0.82;
    const x = clamp(baseX + offset, VEHICLE.HALF_W + 2, WORLD_WIDTH - VEHICLE.HALF_W - 2);
    p.x = x;
    p.y = this.terrain.surfaceY(x) + VEHICLE.HALF_H + 0.2;
    p.vx = 0;
    p.vy = 0;
    p.tilt = 0;
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
