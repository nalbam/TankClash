import { MATCH } from "../../shared/constants";
import type { GameState } from "../schema/GameState";
import type { SimEvents } from "../simEvents";
import type { TeamId } from "../../shared/types";

export interface MatchRuntime {
  endTimer: number;
  /** Set when a round should (re)start via terrain reset + spawn. */
  wantsRestart: boolean;
  /** Lobby mode: set when the ended pause elapses to return to the lobby. */
  wantsLobby: boolean;
  /** True for networked rooms (host-driven start); false for the headless sim. */
  lobbyMode: boolean;
}

/** Number of players that actually fight (humans + bots, excluding spectators). */
function fighterCount(state: GameState): number {
  let n = 0;
  state.players.forEach((p) => {
    if (!p.spectator) n++;
  });
  return n;
}

/**
 * Round flow.
 * - Headless / non-lobby: waiting → playing → ended → (pause) → restart.
 * - Lobby mode: lobby → countdown → playing → ended → (pause) → lobby.
 */
export function stepMatch(state: GameState, runtime: MatchRuntime, events: SimEvents, dt: number): void {
  if (state.phase === "lobby") {
    return; // host-driven: the match starts when the host triggers the countdown
  }

  if (state.phase === "countdown") {
    state.countdown = Math.max(0, state.countdown - dt);
    if (state.countdown <= 0) {
      runtime.wantsRestart = true; // spawn everyone and flip to playing
    }
    return;
  }

  if (state.phase === "waiting") {
    if (!runtime.lobbyMode && fighterCount(state) >= 2) {
      runtime.wantsRestart = true; // first round starts via the same reset path
    }
    return;
  }

  if (state.phase === "playing") {
    state.roundTime += dt;

    // Fall deaths (knocked into the void through destroyed terrain).
    state.players.forEach((p, id) => {
      if (p.alive && p.y < MATCH.FALL_KILL_Y) {
        p.alive = false;
        p.health = 0;
        events.kills.push({ victimId: id, killerId: id });
      }
    });

    // Sudden death keeps bot matches finite: slow decay after the round timer.
    if (state.roundTime > MATCH.ROUND_TIME_S) {
      state.players.forEach((p, id) => {
        if (!p.alive) return;
        p.health = Math.max(0, p.health - MATCH.SUDDEN_DEATH_DPS * dt);
        if (p.health <= 0) {
          p.alive = false;
          events.kills.push({ victimId: id, killerId: id });
        }
      });
    }

    const aliveTeams = new Set<TeamId>();
    state.players.forEach((p) => {
      if (p.alive) aliveTeams.add(p.team);
    });
    if (aliveTeams.size <= 1 && fighterCount(state) >= 2) {
      state.phase = "ended";
      state.winnerTeam = aliveTeams.size === 1 ? [...aliveTeams][0] : "";
      runtime.endTimer = MATCH.END_PAUSE_S;
    }
    return;
  }

  // phase === "ended"
  runtime.endTimer -= dt;
  if (runtime.endTimer <= 0) {
    if (runtime.lobbyMode) runtime.wantsLobby = true; // back to the lobby for re-ready
    else runtime.wantsRestart = true;
  }
}
