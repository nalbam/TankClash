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
  tilt: number;
  charging: boolean;
  charge: number;
  cooldown: number;
  weapon: string;
  shieldTime: number;
  burnTime: number;
  ready: boolean;
  spectator: boolean;
}

/** One entry of the room browser, from Colyseus matchmaking metadata. */
export interface RoomListing {
  roomId: string;
  clients: number;
  maxClients: number;
  mode: string;
  phase: string;
  humans: number;
  capacity: number;
  host: string;
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
  room?: Room;
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

  private client?: Client;
  private snapshots: Snapshot[] = [];
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectName = "Player";
  private reconnectRoomId = "";
  private joinOpts: { spectator?: boolean } = {};

  private ensureClient(): Client {
    if (!this.client) {
      const secure = location.protocol === "https:";
      this.client = new Client(`${secure ? "wss" : "ws"}://${__SERVER_URL__}`);
    }
    return this.client;
  }

  /** Browse open rooms via the server's matchmaking feed. */
  async listRooms(): Promise<RoomListing[]> {
    try {
      const secure = location.protocol === "https:";
      const res = await fetch(`${secure ? "https" : "http"}://${__SERVER_URL__}/api/lobby`);
      const rooms = (await res.json()) as Array<{ roomId: string; clients: number; maxClients: number; metadata: any }>;
      return rooms.map((r) => ({
        roomId: r.roomId,
        clients: r.clients,
        maxClients: r.maxClients,
        mode: r.metadata?.mode ?? "1v1",
        phase: r.metadata?.phase ?? "lobby",
        humans: r.metadata?.humans ?? 0,
        capacity: r.metadata?.capacity ?? 2,
        host: r.metadata?.host ?? "",
      }));
    } catch {
      return [];
    }
  }

  async createRoom(name: string, mode: string): Promise<void> {
    const room = await this.ensureClient().create("tankclash", { name, mode });
    this.bindRoom(room, name, {});
  }

  async joinRoom(roomId: string, name: string, opts: { spectator?: boolean } = {}): Promise<void> {
    const room = await this.ensureClient().joinById(roomId, { name, ...opts });
    this.bindRoom(room, name, opts);
  }

  /** Leave the current room and return to a disconnected (browser) state. */
  leaveRoom(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    try {
      this.room?.leave();
    } catch {
      /* already gone */
    }
    this.room = undefined;
    this.sessionId = "";
    this.connected = false;
    this.reconnecting = false;
    this.snapshots = [];
  }

  private bindRoom(room: Room, name: string, opts: { spectator?: boolean }): void {
    this.room = room;
    this.sessionId = room.sessionId;
    this.connected = true;
    this.reconnecting = false;
    this.reconnectName = name;
    this.reconnectRoomId = room.roomId;
    this.joinOpts = opts;
    this.snapshots = [];

    room.onStateChange(() => this.captureSnapshot());
    room.onLeave((code) => {
      this.connected = false;
      // Abnormal close (server/network drop): try to rejoin the same room.
      // Normal close (code 1000, e.g. headless teardown or leaveRoom) does nothing.
      if (code !== 1000) this.scheduleReconnect();
    });
    room.onError(() => {
      this.connected = false;
    });

    room.onMessage(MSG.TERRAIN_INIT, (init: TerrainInit) => {
      this.terrain = TerrainGrid.generate(init.seed);
      for (const c of init.craters) this.terrain.carveCircle(c.x, c.y, c.r);
      this.terrainVersion++;
    });
    room.onMessage(MSG.CRATER, (c: CraterEvent) => {
      this.terrain.carveCircle(c.x, c.y, c.r);
      this.craterQueue.push(c);
    });
    room.onMessage(MSG.EXPLOSION, (e: ExplosionEvent) => this.explosionQueue.push(e));
    room.onMessage(MSG.FIRED, (f: FiredEvent) => this.firedQueue.push(f));
    room.onMessage(MSG.KILL, (k: KillEvent) => {
      const victim = room.state?.players?.get(k.victimId);
      const killer = room.state?.players?.get(k.killerId);
      this.killQueue.push({
        ...k,
        victimName: victim?.name ?? "?",
        killerName: killer?.name ?? "?",
        victimTeam: victim?.team ?? "",
        killerTeam: killer?.team ?? "",
      });
    });
    room.onMessage(MSG.PONG, (t: number) => {
      this.ping = Math.round(performance.now() - t);
    });

    // Keep getStateCallbacks referenced for schema typing; snapshots drive rendering.
    getStateCallbacks(room);

    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.connected) this.room?.send(MSG.PING, performance.now());
    }, 2000);

    this.captureSnapshot();
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || !this.reconnectRoomId) return;
    this.reconnecting = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    let tries = 0;
    const attempt = () => {
      this.joinRoom(this.reconnectRoomId, this.reconnectName, this.joinOpts).catch(() => {
        // The room may be gone (host left, auto-disposed). Give up after a few tries.
        if (++tries < 4) setTimeout(attempt, 2000);
        else this.reconnecting = false;
      });
    };
    setTimeout(attempt, 1500);
  }

  /** True when the local client is currently watching (no living tank slot). */
  get watching(): boolean {
    const me = this.room?.state?.players?.get(this.sessionId);
    return !me || me.spectator === true;
  }

  sendInput(input: PlayerInput): void {
    if (this.connected) this.room?.send(MSG.INPUT, input);
  }

  sendRestart(): void {
    if (this.connected) this.room?.send(MSG.RESTART);
  }

  sendSelectWeapon(weaponId: string): void {
    if (this.connected) this.room?.send(MSG.SELECT_WEAPON, weaponId);
  }

  sendPause(paused: boolean): void {
    if (this.connected) this.room?.send(MSG.PAUSE, paused);
  }

  sendReady(ready: boolean): void {
    if (this.connected) this.room?.send(MSG.SET_READY, ready);
  }

  sendSelectTeam(team: string): void {
    if (this.connected) this.room?.send(MSG.SELECT_TEAM, team);
  }

  sendSpectator(spectate: boolean): void {
    if (this.connected) this.room?.send(MSG.SET_SPECTATOR, spectate);
  }

  sendStart(): void {
    if (this.connected) this.room?.send(MSG.START_MATCH);
  }

  get state() {
    return this.room?.state;
  }

  private captureSnapshot(): void {
    // The first patch may not have arrived yet right after join.
    if (!this.room?.state?.players) return;
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
        tilt: p.tilt,
        charging: p.charging,
        charge: p.charge,
        cooldown: p.cooldown,
        weapon: p.weapon,
        shieldTime: p.shieldTime,
        burnTime: p.burnTime,
        ready: p.ready,
        spectator: p.spectator,
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
        tilt: b.tilt + (a.tilt - b.tilt) * alpha,
      });
    }
    // Players present only in the latest snapshot (just joined/respawned) still render.
    for (const [id, a] of after.players) {
      if (!players.has(id)) players.set(id, a);
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
