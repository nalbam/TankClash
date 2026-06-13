import { describe, expect, it } from "vitest";
import { FIXED_DT } from "../shared/constants";
import { GameSim } from "../server/GameSim";

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
