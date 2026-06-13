import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { INTERP_DELAY_MS } from "@shared/constants";
import { TerrainGrid } from "@shared/terrain";
import {
  MSG,
  type CraterEvent,
  type ExplosionEvent,
  type FiredEvent,
  type KillEvent,
  type TerrainInit,
  type PlayerInput,
} from "@shared/types";

export interface PlayerView {
  id: string;
  name: string;
  team: string;
  isBot: boolean;
  alive: boolean;
  health: number;
  kills: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastSeq: number;
  aimAngle: number;
  charging: boolean;
  charge: number;
  cooldown: number;
  weapon: string;
  shieldTime: number;
  burnTime: number;
}

export interface ProjectileView {
  id: string;
  weapon: string;
  x: number;
  y: number;
}

interface Snapshot {
  t: number;
  players: Map<string, PlayerView>;
  projectiles: Map<string, ProjectileView>;
}

const BUFFER_LIMIT = 40;

/**
 * Connection + snapshot interpolation. Every Colyseus patch is captured as a
 * timestamped snapshot; rendering reads the world at (now - 100 ms) and lerps
 * between the two surrounding snapshots.
 */
export class NetClient {
  room!: Room;
  sessionId = "";
  connected = false;

  terrain = new TerrainGrid();
  terrainVersion = 0; // bump → full terrain rebuild
  craterQueue: CraterEvent[] = [];
  explosionQueue: ExplosionEvent[] = [];
  firedQueue: FiredEvent[] = [];
  killQueue: Array<KillEvent & { victimName: string; killerName: string; victimTeam: string; killerTeam: string }> = [];

  ping = 0;
  /** Bumps on every server patch — drives client reconciliation. */
  serverVersion = 0;
  /** True once a drop has been detected and a reconnect is pending. */
  reconnecting = false;

  /** True when this client joined to watch, not play. */
  spectator = false;

  private snapshots: Snapshot[] = [];
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectName = "Player";
  private joinOpts: { mode?: string; spectator?: boolean } = {};

  async connect(name: string, opts: { mode?: string; spectator?: boolean } = {}): Promise<void> {
    this.reconnectName = name;
    this.joinOpts = opts;
    this.spectator = opts.spectator === true;
    const secure = location.protocol === "https:";
    const url = `${secure ? "wss" : "ws"}://${__SERVER_URL__}`;
    const client = new Client(url);
    this.room = await client.joinOrCreate("tankclash", { name, ...opts });
    this.sessionId = this.room.sessionId;
    this.connected = true;
    this.reconnecting = false;

    this.room.onStateChange(() => this.captureSnapshot());
    this.room.onLeave((code) => {
      this.connected = false;
      // Abnormal close (server/network drop): auto-reconnect with a fresh join.
      // Normal close (code 1000, e.g. headless teardown) does nothing.
      if (code !== 1000) this.scheduleReconnect();
    });
    this.room.onError(() => {
      this.connected = false;
    });

    this.room.onMessage(MSG.TERRAIN_INIT, (init: TerrainInit) => {
      this.terrain = TerrainGrid.generate(init.seed);
      for (const c of init.craters) this.terrain.carveCircle(c.x, c.y, c.r);
      this.terrainVersion++;
    });
    this.room.onMessage(MSG.CRATER, (c: CraterEvent) => {
      this.terrain.carveCircle(c.x, c.y, c.r);
      this.craterQueue.push(c);
    });
    this.room.onMessage(MSG.EXPLOSION, (e: ExplosionEvent) => this.explosionQueue.push(e));
    this.room.onMessage(MSG.FIRED, (f: FiredEvent) => this.firedQueue.push(f));
    this.room.onMessage(MSG.KILL, (k: KillEvent) => {
      const victim = this.room.state?.players?.get(k.victimId);
      const killer = this.room.state?.players?.get(k.killerId);
      this.killQueue.push({
        ...k,
        victimName: victim?.name ?? "?",
        killerName: killer?.name ?? "?",
        victimTeam: victim?.team ?? "",
        killerTeam: killer?.team ?? "",
      });
    });
    this.room.onMessage(MSG.PONG, (t: number) => {
      this.ping = Math.round(performance.now() - t);
    });

    // Keep getStateCallbacks referenced for schema typing; snapshots drive rendering.
    getStateCallbacks(this.room);

    this.pingTimer = setInterval(() => {
      if (this.connected) this.room.send(MSG.PING, performance.now());
    }, 2000);

    this.captureSnapshot();
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    const attempt = () => {
      this.connect(this.reconnectName, this.joinOpts).catch(() => {
        // Retry until the server comes back.
        setTimeout(attempt, 2000);
      });
    };
    setTimeout(attempt, 1500);
  }

  sendInput(input: PlayerInput): void {
    if (this.connected) this.room.send(MSG.INPUT, input);
  }

  sendRestart(): void {
    if (this.connected) this.room.send(MSG.RESTART);
  }

  sendSelectWeapon(weaponId: string): void {
    if (this.connected) this.room.send(MSG.SELECT_WEAPON, weaponId);
  }

  sendPause(paused: boolean): void {
    if (this.connected) this.room.send(MSG.PAUSE, paused);
  }

  get state() {
    return this.room?.state;
  }

  private captureSnapshot(): void {
    // The first patch may not have arrived yet right after join.
    if (!this.room.state?.players) return;
    const players = new Map<string, PlayerView>();
    this.room.state.players.forEach((p: any, id: string) => {
      players.set(id, {
        id,
        name: p.name,
        team: p.team,
        isBot: p.isBot,
        alive: p.alive,
        health: p.health,
        kills: p.kills,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        lastSeq: p.lastSeq,
        aimAngle: p.aimAngle,
        charging: p.charging,
        charge: p.charge,
        cooldown: p.cooldown,
        weapon: p.weapon,
        shieldTime: p.shieldTime,
        burnTime: p.burnTime,
      });
    });
    const projectiles = new Map<string, ProjectileView>();
    this.room.state.projectiles.forEach((proj: any, id: string) => {
      projectiles.set(id, { id, weapon: proj.weapon, x: proj.x, y: proj.y });
    });
    this.snapshots.push({ t: performance.now(), players, projectiles });
    if (this.snapshots.length > BUFFER_LIMIT) this.snapshots.shift();
    this.serverVersion++;
  }

  /** Latest authoritative view of a player (newest snapshot, no interpolation). */
  authoritative(id: string): PlayerView | undefined {
    return this.snapshots[this.snapshots.length - 1]?.players.get(id);
  }

  /** World view at (now − interpolation delay), lerped between snapshots. */
  interpolated(): { players: Map<string, PlayerView>; projectiles: Map<string, ProjectileView> } {
    const target = performance.now() - INTERP_DELAY_MS;
    const snaps = this.snapshots;
    if (snaps.length === 0) return { players: new Map(), projectiles: new Map() };
    if (snaps.length === 1 || target <= snaps[0].t) {
      return { players: snaps[0].players, projectiles: snaps[0].projectiles };
    }

    let after = snaps[snaps.length - 1];
    let before = after;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= target) {
        before = snaps[i];
        after = snaps[Math.min(i + 1, snaps.length - 1)];
        break;
      }
    }
    const span = after.t - before.t;
    const alpha = span > 0 ? Math.min(1, (target - before.t) / span) : 1;

    const players = new Map<string, PlayerView>();
    for (const [id, b] of before.players) {
      const a = after.players.get(id);
      if (!a) continue;
      players.set(id, {
        ...a,
        x: b.x + (a.x - b.x) * alpha,
        y: b.y + (a.y - b.y) * alpha,
        aimAngle: b.aimAngle + (a.aimAngle - b.aimAngle) * alpha,
      });
    }
    const projectiles = new Map<string, ProjectileView>();
    for (const [id, b] of before.projectiles) {
      const a = after.projectiles.get(id);
      if (!a) {
        continue;
      }
      projectiles.set(id, { ...a, x: b.x + (a.x - b.x) * alpha, y: b.y + (a.y - b.y) * alpha });
    }
    // Newly spawned projectiles not in `before` should still render.
    for (const [id, a] of after.projectiles) {
      if (!projectiles.has(id)) projectiles.set(id, a);
    }
    return { players, projectiles };
  }
}
