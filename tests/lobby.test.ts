import { describe, expect, it } from "vitest";
import { FIXED_DT, MATCH } from "../shared/constants";
import { GameSim } from "../server/GameSim";

/** Drive the sim forward until it reaches a phase (or a tick cap). */
function tickUntil(sim: GameSim, phase: string, maxTicks = 400): void {
  for (let i = 0; i < maxTicks && sim.state.phase !== phase; i++) sim.tick(FIXED_DT);
}

function lobby(fillTo = 2): GameSim {
  return new GameSim(1, { lobbyMode: true, fillTo });
}

describe("lobby flow", () => {
  it("starts in the lobby phase and does not auto-start with two fighters", () => {
    const sim = lobby();
    expect(sim.state.phase).toBe("lobby");
    sim.addPlayer("h1", "H1", false);
    sim.addPlayer("b1", "BOT", true);
    for (let i = 0; i < 30; i++) sim.tick(FIXED_DT);
    expect(sim.state.phase).toBe("lobby"); // host must start it
  });

  it("makes the first human the host; bots are never host", () => {
    const sim = lobby();
    sim.addPlayer("b1", "BOT", true);
    sim.addPlayer("h1", "H1", false);
    sim.addPlayer("h2", "H2", false);
    expect(sim.state.hostId).toBe("h1");
  });

  it("rejects switching onto a team already full of humans", () => {
    const sim = lobby(2); // cap = 1 per side
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.selectTeam("h2", "blue"); // blue already has a human
    expect(sim.state.players.get("h2")!.team).toBe("red");
  });

  it("allows a team switch when the side has a human slot (2v2)", () => {
    const sim = lobby(4); // cap = 2 per side
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.selectTeam("h2", "blue");
    expect(sim.state.players.get("h2")!.team).toBe("blue");
  });

  it("counts down 3s when all ready, 10s otherwise; only the host starts", () => {
    const ready = lobby();
    ready.addPlayer("h1", "H1", false, false, "blue");
    ready.addPlayer("h2", "H2", false, false, "red");
    ready.setReady("h1", true);
    ready.setReady("h2", true);
    ready.requestStart("h2"); // not the host → ignored
    expect(ready.state.phase).toBe("lobby");
    ready.requestStart("h1");
    expect(ready.state.phase).toBe("countdown");
    expect(ready.state.countdown).toBeCloseTo(MATCH.COUNTDOWN_ALL_READY_S, 5);

    const notReady = lobby();
    notReady.addPlayer("h1", "H1", false, false, "blue");
    notReady.addPlayer("h2", "H2", false, false, "red");
    notReady.setReady("h1", true); // h2 not ready
    notReady.requestStart("h1");
    expect(notReady.state.countdown).toBeCloseTo(MATCH.COUNTDOWN_DEFAULT_S, 5);
  });

  it("transitions countdown → playing and spawns fighters", () => {
    const sim = lobby();
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.setReady("h1", true);
    sim.setReady("h2", true);
    sim.requestStart("h1");
    tickUntil(sim, "playing");
    expect(sim.state.phase).toBe("playing");
    expect(sim.state.players.get("h1")!.alive).toBe(true);
    expect(sim.state.players.get("h2")!.alive).toBe(true);
  });

  it("leaving mid-match kills the tank (self-kill) and turns it into a spectator", () => {
    const sim = lobby();
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.setReady("h1", true);
    sim.setReady("h2", true);
    sim.requestStart("h1");
    tickUntil(sim, "playing");
    sim.drainEvents(); // clear any combat events

    sim.setSpectator("h2", true);
    const h2 = sim.state.players.get("h2")!;
    expect(h2.spectator).toBe(true);
    expect(h2.alive).toBe(false);
    const kills = sim.drainEvents().kills;
    expect(kills).toContainEqual({ victimId: "h2", killerId: "h2" });
  });

  it("cannot leave to spectate during the countdown", () => {
    const sim = lobby();
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.requestStart("h1");
    expect(sim.state.phase).toBe("countdown");
    sim.setSpectator("h2", true);
    expect(sim.state.players.get("h2")!.spectator).toBe(false);
  });

  it("reassigns the host to another human when the host leaves", () => {
    const sim = lobby(4);
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    expect(sim.state.hostId).toBe("h1");
    sim.removePlayer("h1");
    expect(sim.state.hostId).toBe("h2");
  });

  it("returns to the lobby after a match ends and clears ready flags", () => {
    const sim = lobby();
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("h2", "H2", false, false, "red");
    sim.setReady("h1", true);
    sim.setReady("h2", true);
    sim.requestStart("h1");
    tickUntil(sim, "playing");

    // Wipe red so blue wins.
    sim.state.players.forEach((p) => {
      if (p.team === "red") {
        p.alive = false;
        p.health = 0;
      }
    });
    tickUntil(sim, "ended");
    expect(sim.state.phase).toBe("ended");

    tickUntil(sim, "lobby");
    expect(sim.state.phase).toBe("lobby");
    expect(sim.state.players.get("h1")!.ready).toBe(false);
    expect(sim.state.countdown).toBe(0);
  });

  it("excludes spectators from the fighter count", () => {
    const sim = lobby();
    sim.addPlayer("h1", "H1", false, false, "blue");
    sim.addPlayer("s1", "S1", false, true); // spectator
    expect(sim.fighterCount()).toBe(1);
  });
});
