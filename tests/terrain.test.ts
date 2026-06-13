import { describe, expect, it } from "vitest";
import { CELL_SIZE, GRID_H, GRID_W, WORLD_WIDTH } from "../shared/constants";
import { ARENA_LAYOUTS, layoutForSeed, TerrainGrid } from "../shared/terrain";

describe("TerrainGrid", () => {
  it("generates identical terrain for the same seed (client/server determinism)", () => {
    const a = TerrainGrid.generate(12345);
    const b = TerrainGrid.generate(12345);
    expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(true);
  });

  it("generates different terrain for different seeds", () => {
    const a = TerrainGrid.generate(1);
    const b = TerrainGrid.generate(2);
    expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(false);
  });

  it("has a playable amount of solid ground", () => {
    const g = TerrainGrid.generate(42);
    const ratio = g.solidCount() / (GRID_W * GRID_H);
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.7);
  });

  it("carves craters that remove cells", () => {
    const g = TerrainGrid.generate(42);
    const x = 120;
    const y = g.surfaceY(x) - 1;
    expect(g.solidAtWorld(x, y)).toBe(true);
    const removed = g.carveCircle(x, y, 4);
    expect(removed).toBeGreaterThan(0);
    expect(g.solidAtWorld(x, y)).toBe(false);
  });

  it("has solid side walls but no floor (bottomless pit) and empty sky", () => {
    const g = new TerrainGrid();
    expect(g.solidAt(-1, 10)).toBe(true); // left wall
    expect(g.solidAt(GRID_W, 10)).toBe(true); // right wall
    expect(g.solidAt(10, -1)).toBe(false); // no floor — falling below is lethal
    expect(g.solidAt(10, GRID_H)).toBe(false); // sky
  });

  it("reports box collisions against the surface", () => {
    const g = TerrainGrid.generate(7);
    const x = 100;
    const surface = g.surfaceY(x);
    expect(g.boxFree(x, surface + 3, 1.5, 1)).toBe(true);
    expect(g.boxFree(x, surface - 2, 1.5, 1)).toBe(false);
  });

  it("surfaceY sits exactly on top of the highest solid cell", () => {
    const g = TerrainGrid.generate(99);
    const x = 60;
    const surface = g.surfaceY(x);
    expect(g.solidAtWorld(x, surface - CELL_SIZE / 2)).toBe(true);
    expect(g.solidAtWorld(x, surface + CELL_SIZE / 2)).toBe(false);
  });
});

describe("arena layouts", () => {
  it("chooses a layout deterministically from the seed", () => {
    expect(layoutForSeed(12345)).toBe(layoutForSeed(12345));
    expect(ARENA_LAYOUTS).toContain(layoutForSeed(777));
  });

  it("generates every layout with playable ground and spawn footing", () => {
    // Seeds chosen so (seed >>> 8) % 4 covers all four layouts.
    const seedFor = (idx: number) => (idx << 8) | 0x11;
    const spawnL = WORLD_WIDTH * 0.18;
    const spawnR = WORLD_WIDTH * 0.82;
    for (let i = 0; i < ARENA_LAYOUTS.length; i++) {
      const seed = seedFor(i);
      const g = TerrainGrid.generate(seed);
      expect(layoutForSeed(seed)).toBe(ARENA_LAYOUTS[i]);

      const ratio = g.solidCount() / (GRID_W * GRID_H);
      expect(ratio).toBeGreaterThan(0.08);
      expect(ratio).toBeLessThan(0.8);

      // Both spawn columns must have ground to stand on.
      expect(g.surfaceY(spawnL)).toBeGreaterThan(2);
      expect(g.surfaceY(spawnR)).toBeGreaterThan(2);
    }
  });
});
