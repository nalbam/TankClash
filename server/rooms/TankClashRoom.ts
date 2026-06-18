import { matchMaker, Room, type Client } from "colyseus";
import { FIXED_DT, PATCH_RATE } from "../../shared/constants";
import { MSG, type TeamId, type TerrainInit } from "../../shared/types";
import { BotController } from "../bots/BotController";
import { GameSim } from "../GameSim";
import type { GameState } from "../schema/GameState";

const BOT_NAMES = ["Rusty", "Boltz", "Crank", "Vex", "Hex", "Tor"];

/** Code alphabet without easily-confused glyphs (no O/0, I/1). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

function randomCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

export class TankClashRoom extends Room<GameState> {
  maxClients = 8;

  private sim!: GameSim;
  private bots = new Map<string, BotController>();
  private accumulator = 0;
  private lastSeed = 0;
  private lastPhase = "";
  /** Total fighters to keep in the match (humans + bots): 2 for 1v1, 4 for 2v2. */
  private fillTo = 2;
  /** Monotonic counter for unique bot session ids. */
  private botSeq = 0;
  /** Solo/bot matches can be truly paused; shared matches cannot. */
  private paused = false;
  /** Per-session sliding-window message counter for flood protection. */
  private msgCounts = new Map<string, { windowStart: number; count: number }>();

  async onCreate(options: { seed?: number; mode?: string } = {}) {
    const seed = Number.isFinite(options.seed) ? Number(options.seed) >>> 0 : (Date.now() & 0x7fffffff) >>> 0;
    this.fillTo = options.mode === "2v2" ? 4 : 2;
    this.sim = new GameSim(seed, { lobbyMode: true, fillTo: this.fillTo });
    this.lastSeed = this.sim.state.terrainSeed;
    this.lastPhase = this.sim.state.phase;
    this.sim.state.roomCode = await this.uniqueRoomCode();
    this.setState(this.sim.state);
    this.setPatchRate(1000 / PATCH_RATE);
    this.reconcileBots();
    this.updateMetadata();

    this.setSimulationInterval((dtMs) => {
      this.accumulator += dtMs / 1000;
      // Cap to avoid spiral-of-death after event loop stalls.
      this.accumulator = Math.min(this.accumulator, FIXED_DT * 5);
      while (this.accumulator >= FIXED_DT) {
        this.accumulator -= FIXED_DT;
        this.fixedTick();
      }
    });

    this.onMessage(MSG.INPUT, (client, message) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.setInput(client.sessionId, message);
    });
    this.onMessage(MSG.RESTART, (client) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.requestRestart();
    });
    this.onMessage(MSG.SELECT_WEAPON, (client, weaponId) => {
      if (!this.allowMessage(client.sessionId)) return;
      if (typeof weaponId === "string") this.sim.selectWeapon(client.sessionId, weaponId);
    });
    this.onMessage(MSG.SET_READY, (client, ready) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.setReady(client.sessionId, ready === true);
    });
    this.onMessage(MSG.SELECT_TEAM, (client, team) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.selectTeam(client.sessionId, team);
      this.afterLobbyChange();
    });
    this.onMessage(MSG.SET_SPECTATOR, (client, spectate) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.setSpectator(client.sessionId, spectate === true);
      this.afterLobbyChange();
    });
    this.onMessage(MSG.START_MATCH, (client) => {
      if (!this.allowMessage(client.sessionId)) return;
      this.sim.requestStart(client.sessionId);
    });
    this.onMessage(MSG.PAUSE, (client, paused) => {
      if (!this.allowMessage(client.sessionId)) return;
      // Only honor pause when a single human is connected (solo/bot match).
      if (this.clients.length <= 1) this.paused = paused === true;
    });
    this.onMessage(MSG.PING, (client, t) => {
      if (!this.allowMessage(client.sessionId)) return;
      client.send(MSG.PONG, t);
    });
  }

  onJoin(client: Client, options: { name?: string; spectator?: boolean } = {}) {
    const name =
      typeof options.name === "string" && options.name.trim()
        ? options.name.trim().slice(0, 16).replace(/[<>]/g, "")
        : "Player";
    // A client can only fight if it asked to play, the room is still in the
    // lobby, and there is an open human slot — otherwise it watches.
    const cap = Math.max(1, Math.floor(this.fillTo / 2));
    const roomForFighter = this.sim.humanFighters("blue") < cap || this.sim.humanFighters("red") < cap;
    const asSpectator = options.spectator === true || this.sim.state.phase !== "lobby" || !roomForFighter;

    this.sim.addPlayer(client.sessionId, name, false, asSpectator);
    this.paused = false; // a new arrival resumes the match
    this.afterLobbyChange();
    const init: TerrainInit = { seed: this.sim.state.terrainSeed, craters: this.sim.craters };
    client.send(MSG.TERRAIN_INIT, init);
  }

  onLeave(client: Client) {
    this.sim.notifyLeaveDuringMatch(client.sessionId); // death in the feed if mid-match
    this.sim.removePlayer(client.sessionId);
    this.msgCounts.delete(client.sessionId);
    this.paused = false; // never strand the room paused after someone leaves
    this.afterLobbyChange();
  }

  /** Sliding 1s window, 200 msgs/session — generous for per-frame input. */
  private allowMessage(sessionId: string): boolean {
    const now = Date.now();
    const e = this.msgCounts.get(sessionId);
    if (!e || now - e.windowStart >= 1000) {
      this.msgCounts.set(sessionId, { windowStart: now, count: 1 });
      return true;
    }
    e.count++;
    return e.count <= 200;
  }

  /** A code not currently used by any other live tankclash room. */
  private async uniqueRoomCode(): Promise<string> {
    const taken = new Set<string>();
    try {
      const rooms = await matchMaker.query({ name: "tankclash" });
      for (const r of rooms) {
        const code = (r.metadata as { code?: string } | undefined)?.code;
        if (code) taken.add(code);
      }
    } catch {
      /* matchmaker unavailable — fall back to a plain random code */
    }
    for (let i = 0; i < 20; i++) {
      const code = randomCode();
      if (!taken.has(code)) return code;
    }
    return randomCode();
  }

  /** Re-fill bots (lobby only) and refresh matchmaking metadata. */
  private afterLobbyChange(): void {
    if (this.sim.state.phase === "lobby") this.reconcileBots();
    this.updateMetadata();
  }

  /**
   * Keep each team's fighter slots filled to cap = fillTo / 2: humans first,
   * bots topping up the rest. Only runs in the lobby so a live match's roster
   * stays fixed.
   */
  private reconcileBots(): void {
    const cap = Math.max(1, Math.floor(this.fillTo / 2));
    for (const team of ["blue", "red"] as TeamId[]) {
      const botIds: string[] = [];
      let humans = 0;
      this.sim.state.players.forEach((p, id) => {
        if (p.spectator || p.team !== team) return;
        if (p.isBot) botIds.push(id);
        else humans++;
      });
      const desiredBots = Math.max(0, cap - humans);
      while (botIds.length > desiredBots) {
        const id = botIds.pop()!;
        this.sim.removePlayer(id);
        this.bots.delete(id);
      }
      while (botIds.length < desiredBots) {
        const id = `bot:${this.botSeq}`;
        this.sim.addPlayer(id, `BOT ${BOT_NAMES[this.botSeq % BOT_NAMES.length]}`, true, false, team);
        this.bots.set(id, new BotController(id, (this.sim.state.terrainSeed ^ (0xb07 + this.botSeq * 131)) >>> 0));
        this.botSeq++;
        botIds.push(id);
      }
    }
  }

  /** Matchmaking metadata so the room list can show mode / phase / occupancy. */
  private updateMetadata(): void {
    let humans = 0;
    let host = "";
    this.sim.state.players.forEach((p, id) => {
      if (!p.isBot && !p.spectator) humans++;
      if (id === this.sim.state.hostId) host = p.name;
    });
    this.setMetadata({
      mode: this.fillTo === 4 ? "2v2" : "1v1",
      phase: this.sim.state.phase,
      humans,
      capacity: this.fillTo,
      host,
      code: this.sim.state.roomCode,
    });
  }

  private fixedTick() {
    if (this.paused) return; // solo match frozen; state stops changing

    for (const [id, bot] of this.bots) {
      if (!this.sim.state.players.has(id)) continue;
      this.sim.setInput(id, bot.update(this.sim, FIXED_DT));
    }

    this.sim.tick(FIXED_DT);

    // Phase change → refresh metadata; returning to the lobby re-fills bots.
    if (this.sim.state.phase !== this.lastPhase) {
      this.lastPhase = this.sim.state.phase;
      if (this.sim.state.phase === "lobby") this.reconcileBots();
      this.updateMetadata();
    }

    // Round reset regenerates terrain → tell clients to drop crater history.
    if (this.sim.state.terrainSeed !== this.lastSeed) {
      this.lastSeed = this.sim.state.terrainSeed;
      const init: TerrainInit = { seed: this.lastSeed, craters: this.sim.craters };
      this.broadcast(MSG.TERRAIN_INIT, init);
    }

    const events = this.sim.drainEvents();
    for (const crater of events.craters) this.broadcast(MSG.CRATER, crater);
    for (const explosion of events.explosions) this.broadcast(MSG.EXPLOSION, explosion);
    for (const fired of events.fired) this.broadcast(MSG.FIRED, fired);
    for (const kill of events.kills) this.broadcast(MSG.KILL, kill);
  }
}
