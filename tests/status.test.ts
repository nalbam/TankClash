import { describe, expect, it } from "vitest";
import { FIXED_DT, STATUS } from "../shared/constants";
import { TerrainGrid } from "../shared/terrain";
import type { CraterEvent } from "../shared/types";
import { CANNON, GRAVITY_BOMB, NAPALM, RAILGUN, REPAIR_FOAM, SHIELD_GRENADE } from "../shared/weapons";
import { GameState } from "../server/schema/GameState";
import { PlayerState } from "../server/schema/PlayerState";
import { createSimEvents } from "../server/simEvents";
import { applyExplosion, stepStatus } from "../server/systems/damageSystem";

function world(players: Record<string, { x: number; y: number; team: "blue" | "red"; health?: number }>) {
  const state = new GameState();
  for (const [id, p] of Object.entries(players)) {
    const ps = new PlayerState();
    ps.x = p.x;
    ps.y = p.y;
    ps.team = p.team;
    ps.health = p.health ?? 100;
    state.players.set(id, ps);
  }
  return {
    state,
    terrain: TerrainGrid.generate(1),
    craters: [] as CraterEvent[],
    events: createSimEvents(),
  };
}

describe("Gravity Bomb", () => {
  it("pulls victims toward the blast instead of away", () => {
    const w = world({ owner: { x: 0, y: 50, team: "blue" }, foe: { x: 108, y: 50, team: "red" } });
    applyExplosion(w.state, w.terrain, w.craters, w.events, 100, 50, GRAVITY_BOMB, "owner", null);
    // Foe is to the right of the blast → pulled left (negative vx).
    expect(w.state.players.get("foe")!.vx).toBeLessThan(0);
  });
});

describe("Napalm", () => {
  it("ignites enemies in the splash with a burn timer", () => {
    const w = world({ owner: { x: 0, y: 50, team: "blue" }, foe: { x: 103, y: 50, team: "red" } });
    applyExplosion(w.state, w.terrain, w.craters, w.events, 100, 50, NAPALM, "owner", null);
    expect(w.state.players.get("foe")!.burnTime).toBeCloseTo(NAPALM.burnDuration!, 5);
  });

  it("burn deals damage-over-time and can kill, crediting the igniter", () => {
    const w = world({ foe: { x: 100, y: 50, team: "red", health: 5 } });
    const foe = w.state.players.get("foe")!;
    foe.burnTime = 4;
    foe.burnOwnerId = "owner";
    // One second of burn at BURN_DPS should exceed 5 HP.
    for (let i = 0; i < Math.ceil(1 / FIXED_DT); i++) stepStatus(w.state, w.events, foe, "foe", FIXED_DT);
    expect(foe.alive).toBe(false);
    expect(w.events.kills.at(-1)).toEqual({ victimId: "foe", killerId: "owner" });
    expect(STATUS.BURN_DPS).toBeGreaterThan(0);
  });
});

describe("Shield Grenade", () => {
  it("shields allies and leaves enemies untouched", () => {
    const w = world({
      owner: { x: 100, y: 50, team: "blue" },
      ally: { x: 103, y: 50, team: "blue" },
      foe: { x: 104, y: 50, team: "red" },
    });
    applyExplosion(w.state, w.terrain, w.craters, w.events, 100, 50, SHIELD_GRENADE, "owner", null);
    expect(w.state.players.get("ally")!.shieldTime).toBeGreaterThan(0);
    expect(w.state.players.get("foe")!.shieldTime).toBe(0);
    expect(w.state.players.get("foe")!.health).toBe(100); // no damage
  });

  it("reduces incoming damage while active", () => {
    const shielded = world({ o: { x: 0, y: 50, team: "red" }, v: { x: 100, y: 50, team: "blue" } });
    shielded.state.players.get("v")!.shieldTime = 5;
    applyExplosion(shielded.state, shielded.terrain, shielded.craters, shielded.events, 100, 50, CANNON, "o", "v");
    const shieldedDmg = 100 - shielded.state.players.get("v")!.health;

    const bare = world({ o: { x: 0, y: 50, team: "red" }, v: { x: 100, y: 50, team: "blue" } });
    applyExplosion(bare.state, bare.terrain, bare.craters, bare.events, 100, 50, CANNON, "o", "v");
    const bareDmg = 100 - bare.state.players.get("v")!.health;

    expect(shieldedDmg).toBeLessThan(bareDmg);
    expect(shieldedDmg).toBeCloseTo(bareDmg * (1 - STATUS.SHIELD_REDUCTION), 1);
  });
});

describe("Repair Foam", () => {
  it("heals allies and ignores enemies", () => {
    const w = world({
      owner: { x: 100, y: 50, team: "blue", health: 100 },
      ally: { x: 103, y: 50, team: "blue", health: 40 },
      foe: { x: 104, y: 50, team: "red", health: 40 },
    });
    applyExplosion(w.state, w.terrain, w.craters, w.events, 100, 50, REPAIR_FOAM, "owner", null);
    expect(w.state.players.get("ally")!.health).toBeGreaterThan(40);
    expect(w.state.players.get("foe")!.health).toBe(40); // enemy unaffected
  });
});

describe("Railgun", () => {
  it("is a flat, near-instant high-speed shot", () => {
    expect(RAILGUN.gravityScale).toBe(0);
    expect(RAILGUN.minSpeed).toBeGreaterThan(150);
    expect(RAILGUN.directBonus).toBeGreaterThan(RAILGUN.damageMax * 0.5);
  });
});
