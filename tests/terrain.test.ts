import { describe, expect, it } from "vitest";
import { CELL_SIZE, GRID_H, GRID_W } from "../shared/constants";
import { TerrainGrid } from "../shared/terrain";

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

  it("treats side walls and floor as solid, sky as empty", () => {
    const g = new TerrainGrid();
    expect(g.solidAt(-1, 10)).toBe(true);
    expect(g.solidAt(GRID_W, 10)).toBe(true);
    expect(g.solidAt(10, -1)).toBe(true);
    expect(g.solidAt(10, GRID_H)).toBe(false);
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
