import { Schema, type } from "@colyseus/schema";
import { PLAYER_MAX_HEALTH } from "../../shared/constants";
import type { PlayerInput, TeamId } from "../../shared/types";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("string") team: TeamId = "blue";
  @type("boolean") isBot = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") aimAngle = 0;
  @type("boolean") charging = false;
  @type("number") charge = 0;
  @type("number") health = PLAYER_MAX_HEALTH;
  @type("boolean") alive = true;
  @type("number") cooldown = 0;
  @type("number") kills = 0;
  @type("string") weapon = "cannon";
  @type("number") lastSeq = 0;

  // Server-only runtime fields (not decorated → not synchronized).
  input: PlayerInput = {
    seq: 0,
    left: false,
    right: false,
    jump: false,
    dash: false,
    aimAngle: 0,
    charging: false,
  };
  grounded = false;
  dashCooldown = 0;
}
