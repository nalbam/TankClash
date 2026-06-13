import { Room, type Client } from "colyseus";
import { FIXED_DT, PATCH_RATE } from "../../shared/constants";
import { MSG, type TerrainInit } from "../../shared/types";
import { BotController } from "../bots/BotController";
import { GameSim } from "../GameSim";
import type { GameState } from "../schema/GameState";

const BOT_NAMES = ["Rusty", "Boltz", "Crank", "Vex"];

export class TankClashRoom extends Room<GameState> {
  maxClients = 8;

  private sim!: GameSim;
  private bots = new Map<string, BotController>();
  private accumulator = 0;
  private lastSeed = 0;
  /** Total tanks to keep in the match (humans + bots): 2 for 1v1, 4 for 2v2. */
  private fillTo = 2;

  onCreate(options: { seed?: number; mode?: string } = {}) {
    const seed = Number.isFinite(options.seed) ? Number(options.seed) >>> 0 : (Date.now() & 0x7fffffff) >>> 0;
    this.fillTo = options.mode === "2v2" ? 4 : 2;
    this.sim = new GameSim(seed);
    this.lastSeed = this.sim.state.terrainSeed;
    this.setState(this.sim.state);
    this.setPatchRate(1000 / PATCH_RATE);

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
      this.sim.setInput(client.sessionId, message);
    });
    this.onMessage(MSG.RESTART, () => {
      this.sim.requestRestart();
    });
    this.onMessage(MSG.SELECT_WEAPON, (client, weaponId) => {
      if (typeof weaponId === "string") this.sim.selectWeapon(client.sessionId, weaponId);
    });
    this.onMessage(MSG.PING, (client, t) => {
      client.send(MSG.PONG, t);
    });
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const name = typeof options.name === "string" && options.name.trim() ? options.name.trim().slice(0, 16) : "Player";
    this.sim.addPlayer(client.sessionId, name, false);
    this.fillBots();
    const init: TerrainInit = { seed: this.sim.state.terrainSeed, craters: this.sim.craters };
    client.send(MSG.TERRAIN_INIT, init);
  }

  onLeave(client: Client) {
    this.sim.removePlayer(client.sessionId);
  }

  /** Top up the match with bots so it reaches the mode's tank count. */
  private fillBots() {
    let i = 0;
    while (this.sim.state.players.size < this.fillTo && i < 8) {
      const id = `bot:${i}`;
      if (!this.sim.state.players.has(id)) {
        this.sim.addPlayer(id, `BOT ${BOT_NAMES[i % BOT_NAMES.length]}`, true);
        this.bots.set(id, new BotController(id, (this.sim.state.terrainSeed ^ (0xb07 + i * 131)) >>> 0));
      }
      i++;
    }
  }

  private fixedTick() {
    for (const [id, bot] of this.bots) {
      if (!this.sim.state.players.has(id)) continue;
      this.sim.setInput(id, bot.update(this.sim, FIXED_DT));
    }

    this.sim.tick(FIXED_DT);

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
