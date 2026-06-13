import { describe, expect, it } from "vitest";
import { TerrainGrid } from "../shared/terrain";
import type { CraterEvent } from "../shared/types";
import { CANNON } from "../shared/weapons";
import { GameState } from "../server/schema/GameState";
import { PlayerState } from "../server/schema/PlayerState";
import { createSimEvents } from "../server/simEvents";
import { applyExplosion } from "../server/systems/damageSystem";

function setup(positions: Record<string, { x: number; y: number }>) {
  const state = new GameState();
  for (const [id, pos] of Object.entries(positions)) {
    const p = new PlayerState();
    p.x = pos.x;
    p.y = pos.y;
    state.players.set(id, p);
  }
  const terrain = TerrainGrid.generate(1);
  const craters: CraterEvent[] = [];
  const events = createSimEvents();
  return { state, terrain, craters, events };
}

describe("damage resolution", () => {
  it("applies splash damage with distance falloff", () => {
    const { state, terrain, craters, events } = setup({
      near: { x: 101, y: 50 },
      far: { x: 105, y: 50 },
      outside: { x: 140, y: 50 },
    });
    applyExplosion(state, terrain, craters, events, 100, 50, CANNON, "shooter", null);

    const near = state.players.get("near")!;
    const far = state.players.get("far")!;
    const outside = state.players.get("outside")!;
    expect(near.health).toBeLessThan(far.health);
    expect(far.health).toBeLessThan(100);
    expect(outside.health).toBe(100);
  });

  it("grants a direct-hit bonus", () => {
    const a = setup({ v: { x: 102, y: 50 } });
    applyExplosion(a.state, a.terrain, a.craters, a.events, 100, 50, CANNON, "shooter", "v");
    const direct = 100 - a.state.players.get("v")!.health;

    const b = setup({ v: { x: 102, y: 50 } });
    applyExplosion(b.state, b.terrain, b.craters, b.events, 100, 50, CANNON, "shooter", null);
    const splashOnly = 100 - b.state.players.get("v")!.health;

    expect(direct).toBeGreaterThan(splashOnly);
  });

  it("scales down self damage", () => {
    const { state, terrain, craters, events } = setup({
      self: { x: 101, y: 50 },
      other: { x: 99, y: 50 },
    });
    applyExplosion(state, terrain, craters, events, 100, 50, CANNON, "self", null);
    const selfDmg = 100 - state.players.get("self")!.health;
    const otherDmg = 100 - state.players.get("other")!.health;
    expect(selfDmg).toBeLessThan(otherDmg);
    expect(selfDmg).toBeGreaterThan(0);
  });

  it("knocks players away from the blast", () => {
    const { state, terrain, craters, events } = setup({
      right: { x: 103, y: 50 },
      left: { x: 97, y: 50 },
    });
    applyExplosion(state, terrain, craters, events, 100, 50, CANNON, "shooter", null);
    expect(state.players.get("right")!.vx).toBeGreaterThan(0);
    expect(state.players.get("left")!.vx).toBeLessThan(0);
    expect(state.players.get("right")!.vy).toBeGreaterThan(0); // blast pop-up
  });

  it("kills at zero health, credits the killer, and emits a kill event", () => {
    const { state, terrain, craters, events } = setup({
      victim: { x: 100, y: 50 },
      shooter: { x: 150, y: 50 },
    });
    const victim = state.players.get("victim")!;
    victim.health = 10;
    applyExplosion(state, terrain, craters, events, 100, 50, CANNON, "shooter", "victim");

    expect(victim.health).toBe(0);
    expect(victim.alive).toBe(false);
    expect(state.players.get("shooter")!.kills).toBe(1);
    expect(events.kills).toEqual([{ victimId: "victim", killerId: "shooter" }]);
  });

  it("carves a crater and records the event", () => {
    const { state, terrain, craters, events } = setup({});
    const x = 120;
    const y = terrain.surfaceY(x) - 0.5;
    const before = terrain.solidCount();
    applyExplosion(state, terrain, craters, events, x, y, CANNON, "shooter", null);
    expect(terrain.solidCount()).toBeLessThan(before);
    expect(craters).toHaveLength(1);
    expect(events.craters).toHaveLength(1);
    expect(events.explosions).toHaveLength(1);
  });
});
