import { describe, expect, it } from "vitest";
import { AIM_BELOW_HORIZON, FIXED_DT, GRAVITY, GRID_H, GRID_W, VEHICLE } from "../shared/constants";
import { clampAimToTilt, terrainTilt } from "../shared/physics";
import { TerrainGrid } from "../shared/terrain";
import { CANNON } from "../shared/weapons";
import { PlayerState } from "../server/schema/PlayerState";
import { ProjectileState } from "../server/schema/ProjectileState";
import { stepProjectile, stepVehicle } from "../server/systems/physicsSystem";

/** Flat ground: solid below world y = 20, empty above. */
function flatTerrain(groundY = 20): TerrainGrid {
  const g = new TerrainGrid();
  const rows = Math.round(groundY / 0.5);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) g.cells[cy * GRID_W + cx] = 1;
  }
  return g;
}

function makePlayer(x: number, y: number): PlayerState {
  const p = new PlayerState();
  p.x = x;
  p.y = y;
  return p;
}

function makeProjectile(x: number, y: number, vx: number, vy: number): ProjectileState {
  const proj = new ProjectileState();
  proj.x = x;
  proj.y = y;
  proj.vx = vx;
  proj.vy = vy;
  proj.ownerId = "shooter";
  return proj;
}

describe("projectile physics", () => {
  it("follows a gravity parabola without wind", () => {
    const terrain = flatTerrain(1);
    const proj = makeProjectile(50, 60, 20, 10);
    stepProjectile(proj, CANNON, terrain, 0, [], FIXED_DT);
    expect(proj.vx).toBeCloseTo(20, 5);
    expect(proj.vy).toBeCloseTo(10 + GRAVITY * FIXED_DT, 5);
    expect(proj.x).toBeCloseTo(50 + proj.vx * FIXED_DT, 5);
  });

  it("is pushed horizontally by wind", () => {
    const terrain = flatTerrain(1);
    const proj = makeProjectile(50, 60, 20, 10);
    stepProjectile(proj, CANNON, terrain, 8, [], FIXED_DT);
    expect(proj.vx).toBeCloseTo(20 + 8 * CANNON.windInfluence * FIXED_DT, 5);
  });

  it("impacts terrain when falling into the ground", () => {
    const terrain = flatTerrain(20);
    const proj = makeProjectile(50, 30, 0, -40);
    let impact: ReturnType<typeof stepProjectile> = null;
    for (let i = 0; i < 60 && !impact; i++) {
      impact = stepProjectile(proj, CANNON, terrain, 0, [], FIXED_DT);
    }
    expect(impact).not.toBeNull();
    expect(impact).not.toBe("out");
    if (impact && impact !== "out" && !("pierce" in impact)) {
      expect(impact.y).toBeLessThanOrEqual(20.5);
      expect(impact.directHitId).toBeNull();
    }
  });

  it("registers a direct hit on a vehicle in its path", () => {
    const terrain = flatTerrain(1);
    const victim = makePlayer(60, 30);
    victim.alive = true;
    const proj = makeProjectile(50, 30, 40, 0);
    let impact: ReturnType<typeof stepProjectile> = null;
    for (let i = 0; i < 30 && !impact; i++) {
      impact = stepProjectile(proj, CANNON, terrain, 0, [["victim", victim]], FIXED_DT);
    }
    expect(impact).not.toBeNull();
    if (impact && impact !== "out" && !("pierce" in impact)) {
      expect(impact.directHitId).toBe("victim");
    }
  });

  it("never collides with its own shooter", () => {
    const terrain = flatTerrain(1);
    const shooter = makePlayer(50, 30);
    const proj = makeProjectile(50, 30, 40, 0);
    const impact = stepProjectile(proj, CANNON, terrain, 0, [["shooter", shooter]], FIXED_DT);
    expect(impact).toBeNull();
  });
});

describe("vehicle physics", () => {
  it("falls under gravity and lands on the ground", () => {
    const terrain = flatTerrain(20);
    const p = makePlayer(100, 40);
    for (let i = 0; i < 120; i++) stepVehicle(p, terrain, FIXED_DT);
    expect(p.grounded).toBe(true);
    expect(p.vy).toBe(0);
    expect(p.y).toBeGreaterThanOrEqual(20 + VEHICLE.HALF_H - 0.3);
    expect(p.y).toBeLessThan(22);
  });

  it("accelerates with input and respects max speed", () => {
    const terrain = flatTerrain(20);
    const p = makePlayer(50, 20 + VEHICLE.HALF_H + 0.05);
    p.input.right = true;
    for (let i = 0; i < 90; i++) stepVehicle(p, terrain, FIXED_DT);
    expect(p.vx).toBeGreaterThan(VEHICLE.MAX_SPEED * 0.9);
    expect(p.vx).toBeLessThanOrEqual(VEHICLE.MAX_SPEED + 0.01);
    expect(p.x).toBeGreaterThan(50);
  });

  it("decelerates to rest with friction when input stops", () => {
    const terrain = flatTerrain(20);
    const p = makePlayer(50, 20 + VEHICLE.HALF_H + 0.05);
    p.vx = VEHICLE.MAX_SPEED;
    for (let i = 0; i < 60; i++) stepVehicle(p, terrain, FIXED_DT);
    expect(p.vx).toBe(0);
  });

  it("jumps only when grounded", () => {
    const terrain = flatTerrain(20);
    const p = makePlayer(50, 20 + VEHICLE.HALF_H + 0.05);
    p.input.jump = true;
    stepVehicle(p, terrain, FIXED_DT);
    expect(p.vy).toBeGreaterThan(0);

    const airborne = makePlayer(50, 40);
    airborne.input.jump = true;
    stepVehicle(airborne, terrain, FIXED_DT);
    expect(airborne.vy).toBeLessThan(VEHICLE.JUMP_VELOCITY / 2);
  });

  it("climbs small steps (slopes) but is blocked by tall walls", () => {
    const terrain = flatTerrain(20);
    // 1-unit step at x >= 60.
    for (let cy = 40; cy < 42; cy++) {
      for (let cx = 120; cx < GRID_W; cx++) terrain.cells[cy * GRID_W + cx] = 1;
    }
    // Tall wall at x >= 80 (6 units).
    for (let cy = 40; cy < 54; cy++) {
      for (let cx = 160; cx < GRID_W; cx++) terrain.cells[cy * GRID_W + cx] = 1;
    }

    const p = makePlayer(55, 20 + VEHICLE.HALF_H + 0.05);
    p.input.right = true;
    for (let i = 0; i < 150; i++) stepVehicle(p, terrain, FIXED_DT);

    expect(p.x).toBeGreaterThan(61); // climbed the step
    expect(p.x).toBeLessThan(80 - VEHICLE.HALF_W + 0.5); // stopped at the wall
  });

  it("keeps all values finite under chaotic knockback", () => {
    const terrain = TerrainGrid.generate(5);
    const p = makePlayer(120, terrain.surfaceY(120) + VEHICLE.HALF_H + 0.1);
    p.vx = 500;
    p.vy = 300;
    for (let i = 0; i < 300; i++) stepVehicle(p, terrain, FIXED_DT);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(Number.isFinite(p.vx)).toBe(true);
    expect(Number.isFinite(p.vy)).toBe(true);
  });

  it("settles tilt to level on flat ground", () => {
    const terrain = flatTerrain(20);
    const p = makePlayer(100, 20 + VEHICLE.HALF_H + 0.05);
    for (let i = 0; i < 30; i++) stepVehicle(p, terrain, FIXED_DT);
    expect(p.tilt).toBeCloseTo(0, 4);
  });
});

describe("tilt & aim limits", () => {
  it("terrainTilt: level on flat ground, clamped on a steep rightward slope", () => {
    expect(terrainTilt(flatTerrain(20), 100)).toBeCloseTo(0, 6);

    // 1 cell of rise per cell to the right → ~45°, clamped to MAX_TILT.
    const cliff = new TerrainGrid();
    for (let cx = 0; cx < GRID_W; cx++) {
      const h = Math.min(GRID_H - 1, cx);
      for (let cy = 0; cy < h; cy++) cliff.cells[cy * GRID_W + cx] = 1;
    }
    expect(terrainTilt(cliff, 40)).toBeCloseTo(VEHICLE.MAX_TILT, 6);
  });

  it("clampAimToTilt: level tank allows upward aim, limits steep downward aim", () => {
    expect(clampAimToTilt(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 6); // straight up
    expect(clampAimToTilt(-0.2, 0)).toBeCloseTo(-0.2, 6); // shallow down within margin
    expect(clampAimToTilt(-0.8, 0)).toBeCloseTo(-AIM_BELOW_HORIZON, 4); // steep down clamped
  });

  it("clampAimToTilt: tilting the tank rotates the reachable arc", () => {
    // Flat-right (0) passes on level ground but is nudged up on an uphill tilt,
    // because the downhill limit rotates with the tank.
    expect(clampAimToTilt(0, 0)).toBeCloseTo(0, 6);
    expect(clampAimToTilt(0, 0.3)).toBeGreaterThan(0);
  });
});
