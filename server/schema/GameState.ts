import { MapSchema, Schema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { ProjectileState } from "./ProjectileState";

export type MatchPhase = "waiting" | "playing" | "ended";

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
  @type("number") wind = 0;
  @type("string") phase: MatchPhase = "waiting";
  @type("string") winnerTeam = "";
  @type("number") roundTime = 0;
  @type("number") terrainSeed = 0;
}
