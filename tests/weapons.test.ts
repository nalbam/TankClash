import { describe, expect, it } from "vitest";
import { GRID_W } from "../shared/constants";
import { TerrainGrid } from "../shared/terrain";
import { CLUSTER, DRILL, SELECTABLE_WEAPONS, SHOTGUN, WEAPONS } from "../shared/weapons";
import { GameSim } from "../server/GameSim";
import { GameState } from "../server/schema/GameState";
import { PlayerState } from "../server/schema/PlayerState";
import { createSimEvents } from "../server/simEvents";
import { stepWeapon } from "../server/systems/weaponSystem";

function flatColumnTerrain(): TerrainGrid {
  // A vertical wall column near x=120 so we can test drilling/cover.
  const g = new TerrainGrid();
  for (let cy = 0; cy < g.h; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      if (cy < 30) g.cells[cy * GRID_W + cx] = 1; // ground
    }
  }
  return g;
}

describe("weapon catalog", () => {
  it("exposes ten selectable weapons, each with a unique role", () => {
    expect(SELECTABLE_WEAPONS).toHaveLength(10);
    const ids = SELECTABLE_WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual([
      "cannon",
      "mortar",
      "shotgun",
      "cluster",
      "drill",
      "railgun",
      "gravity",
      "napalm",
      "shield",
      "repair",
    ]);
  });

  it("keeps the bomblet non-selectable (cluster child only)", () => {
    expect(WEAPONS.bomblet.selectable).toBe(false);
    expect(SELECTABLE_WEAPONS.find((w) => w.id === "bomblet")).toBeUndefined();
  });

  it("describes distinct behaviors per weapon", () => {
    expect(SHOTGUN.pellets).toBeGreaterThan(1);
    expect(CLUSTER.splitOnImpact?.count).toBeGreaterThan(1);
    expect(DRILL.pierce).toBeGreaterThan(0);
  });
});

describe("weapon firing in the simulation", () => {
  function fire(weapon: string, aimAngle: number, terrain: TerrainGrid = flatColumnTerrain()) {
    const sim = new GameSim(123);
    sim.terrain = terrain;
    const a = sim.addPlayer("a", "A", false);
    sim.addPlayer("b", "B", false); // makes phase=playing on reset
    // Force a clean playing state with both tanks placed.
    sim.tick(0.016);
    a.weapon = weapon;
    a.x = 60;
    a.y = 40;
    a.aimAngle = aimAngle;
    a.input = { seq: 1, left: false, right: false, jump: false, dash: false, aimAngle, charging: true };
    // Charge to full, then release.
    for (let i = 0; i < 200; i++) sim.tick(0.016);
    a.input = { ...a.input, charging: false };
    sim.tick(0.016);
    return sim;
  }

  it("shotgun spawns one pellet per pellet count on release", () => {
    // Unit-test the firing step directly so projectile integration can't cull
    // pellets before we count them.
    const state = new GameState();
    const events = createSimEvents();
    const p = new PlayerState();
    p.weapon = "shotgun";
    p.alive = true;
    p.x = 60;
    p.y = 40;
    p.charging = true;
    p.charge = 1;
    p.input = { seq: 1, left: false, right: false, jump: false, dash: false, aimAngle: 0.5, charging: false };
    let n = 0;
    stepWeapon(state, events, "a", p, () => `p${n++}`, 0.016);

    let pellets = 0;
    state.projectiles.forEach((pr) => {
      if (pr.weapon === "shotgun") pellets++;
    });
    expect(pellets).toBe(SHOTGUN.pellets);
    expect(events.fired).toHaveLength(1); // one shot event, not one per pellet
  });

  it("cluster rocket splits into bomblets on impact", () => {
    const sim = fire("cluster", 0.4);
    // Run until the rocket impacts and spawns bomblets.
    let sawBomblet = false;
    for (let i = 0; i < 400 && !sawBomblet; i++) {
      sim.tick(0.016);
      sim.state.projectiles.forEach((p) => {
        if (p.weapon === "bomblet") sawBomblet = true;
      });
    }
    expect(sawBomblet).toBe(true);
  });

  it("drill missile carves a tunnel through terrain (removes solid cells)", () => {
    const sim = new GameSim(123);
    sim.terrain = flatColumnTerrain();
    const a = sim.addPlayer("a", "A", false);
    sim.addPlayer("b", "B", false);
    sim.tick(0.016);
    a.weapon = "drill";
    a.x = 60;
    a.y = 10; // inside the ground band → drill bores horizontally
    a.aimAngle = 0;
    a.input = { seq: 1, left: false, right: false, jump: false, dash: false, aimAngle: 0, charging: true };
    for (let i = 0; i < 200; i++) sim.tick(0.016);
    a.input = { ...a.input, charging: false };

    const before = sim.terrain.solidCount();
    for (let i = 0; i < 120; i++) sim.tick(0.016);
    expect(sim.terrain.solidCount()).toBeLessThan(before);
  });
});
