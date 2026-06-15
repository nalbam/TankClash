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
  /** Body tilt (rad) following the terrain slope; drives lean + aim limits. */
  @type("number") tilt = 0;
  @type("boolean") charging = false;
  @type("number") charge = 0;
  @type("number") health = PLAYER_MAX_HEALTH;
  @type("boolean") alive = true;
  @type("number") cooldown = 0;
  @type("number") kills = 0;
  @type("string") weapon = "cannon";
  @type("number") lastSeq = 0;
  /** Remaining shield time (s); >0 reduces incoming damage. */
  @type("number") shieldTime = 0;
  /** Remaining burn time (s); ticks damage-over-time. */
  @type("number") burnTime = 0;
  /** Lobby: marked ready to start. Bots are treated as always ready. */
  @type("boolean") ready = false;
  /** Watching, not fighting: no tank, excluded from spawns and win checks. */
  @type("boolean") spectator = false;

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
  /** Who set the current burn (for kill credit). */
  burnOwnerId = "";
}
