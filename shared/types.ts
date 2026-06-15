/** Continuous input state sent from client to server (and produced by bots). */
export interface PlayerInput {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
  dash: boolean;
  /** Aim angle in radians, world space (0 = +x, PI/2 = up). */
  aimAngle: number;
  /** True while the fire button is held; release fires with accumulated charge. */
  charging: boolean;
}

export interface CraterEvent {
  x: number;
  y: number;
  r: number;
}

export interface ExplosionEvent {
  x: number;
  y: number;
  r: number;
  weapon: string;
}

export interface FiredEvent {
  playerId: string;
  weapon: string;
  x: number;
  y: number;
  angle: number;
  power: number;
}

export interface KillEvent {
  victimId: string;
  killerId: string;
}

/** Sent to a client on join so it can reconstruct terrain deterministically. */
export interface TerrainInit {
  seed: number;
  craters: CraterEvent[];
}

export const MSG = {
  INPUT: "input",
  RESTART: "restart",
  SELECT_WEAPON: "selectWeapon",
  PAUSE: "pause",
  // Lobby (client → server)
  SET_READY: "setReady",
  SELECT_TEAM: "selectTeam",
  SET_SPECTATOR: "setSpectator",
  START_MATCH: "startMatch",
  TERRAIN_INIT: "terrainInit",
  CRATER: "crater",
  EXPLOSION: "explosion",
  FIRED: "fired",
  KILL: "kill",
  PING: "ping",
  PONG: "pong",
} as const;

export type TeamId = "blue" | "red";
