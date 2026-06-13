import { describe, expect, it } from "vitest";
import { FIXED_DT, GRID_H } from "../shared/constants";
import { GameSim } from "../server/GameSim";

const NEUTRAL_INPUT = {
  seq: 1,
  left: false,
  right: false,
  jump: false,
  dash: false,
  aimAngle: 0,
  charging: false,
};

describe("team matches", () => {
  it("assigns alternating teams so four players form 2v2", () => {
    const sim = new GameSim(1);
    for (const id of ["a", "b", "c", "d"]) sim.addPlayer(id, id.toUpperCase(), false);
    const teams = [...sim.state.players.values()].map((p) => p.team);
    expect(teams.filter((t) => t === "blue")).toHaveLength(2);
    expect(teams.filter((t) => t === "red")).toHaveLength(2);
  });

  it("ends a 2v2 round when one whole team is eliminated", () => {
    const sim = new GameSim(1);
    for (const id of ["a", "b", "c", "d"]) sim.addPlayer(id, id.toUpperCase(), false);
    sim.tick(FIXED_DT);
    expect(sim.state.phase).toBe("playing");

    // Wipe out the red team.
    sim.state.players.forEach((p) => {
      if (p.team === "red") {
        p.alive = false;
        p.health = 0;
      }
    });
    sim.tick(FIXED_DT);

    expect(sim.state.phase).toBe("ended");
    expect(sim.state.winnerTeam).toBe("blue");
  });

  it("kills a tank that falls through a bottomless gap (danger zone)", () => {
    const sim = new GameSim(1);
    sim.addPlayer("a", "A", false);
    sim.addPlayer("b", "B", false);
    sim.tick(FIXED_DT);
    const a = sim.state.players.get("a")!;

    // Carve the whole column under A down past the (now absent) world floor.
    a.x = 120;
    for (let cy = 0; cy < GRID_H; cy++) sim.terrain.carveCircle(120, cy * 0.5, 4);
    a.y = 40;
    a.vx = 0;
    a.vy = 0;
    a.input = { ...NEUTRAL_INPUT };

    let died = false;
    for (let i = 0; i < 200; i++) {
      sim.tick(FIXED_DT);
      if (!a.alive) {
        died = true;
        break;
      }
    }
    expect(died).toBe(true);
    expect(a.y).toBeLessThan(0); // fell below the terrain before dying
  });

  it("does not end while both teams still have a survivor", () => {
    const sim = new GameSim(1);
    for (const id of ["a", "b", "c", "d"]) sim.addPlayer(id, id.toUpperCase(), false);
    sim.tick(FIXED_DT);

    // Kill one from each team — both teams still have a survivor.
    const ids = [...sim.state.players.keys()];
    const firstBlue = ids.find((id) => sim.state.players.get(id)!.team === "blue")!;
    const firstRed = ids.find((id) => sim.state.players.get(id)!.team === "red")!;
    for (const id of [firstBlue, firstRed]) {
      const p = sim.state.players.get(id)!;
      p.alive = false;
      p.health = 0;
    }
    sim.tick(FIXED_DT);

    expect(sim.state.phase).toBe("playing");
  });
});
