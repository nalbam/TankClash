import { CELL_SIZE, GRID_H, GRID_W, WORLD_HEIGHT } from "./constants";
import { createFbm1D, createRng } from "./math";

/**
 * Destructible 2D solidity grid — the authoritative terrain representation.
 * Server owns the source of truth; clients regenerate the identical grid from
 * the seed and replay crater events (deterministic by construction).
 */
export class TerrainGrid {
  readonly w = GRID_W;
  readonly h = GRID_H;
  /** 1 = solid, 0 = empty. Row-major, index = cy * w + cx. */
  readonly cells: Uint8Array;

  constructor(cells?: Uint8Array) {
    this.cells = cells ?? new Uint8Array(GRID_W * GRID_H);
  }

  static generate(seed: number): TerrainGrid {
    const grid = new TerrainGrid();
    const fbm = createFbm1D(seed, 4);
    const rng = createRng(seed ^ 0x5eed);

    // Surface profile: rolling hills between ~22% and ~55% of world height.
    const heights: number[] = [];
    for (let cx = 0; cx < GRID_W; cx++) {
      const n = fbm(cx * 0.015);
      const hWorld = WORLD_HEIGHT * (0.22 + n * 0.33);
      heights.push(Math.round(hWorld / CELL_SIZE));
    }

    for (let cx = 0; cx < GRID_W; cx++) {
      const top = heights[cx];
      for (let cy = 0; cy < top && cy < GRID_H; cy++) {
        grid.cells[cy * GRID_W + cx] = 1;
      }
    }

    // A few pre-carved pockets so the arena starts with cover variety.
    const pockets = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < pockets; i++) {
      const wx = (0.1 + rng() * 0.8) * GRID_W * CELL_SIZE;
      const wy = heights[Math.floor(wx / CELL_SIZE)] * CELL_SIZE * (0.4 + rng() * 0.5);
      grid.carveCircle(wx, wy, 3 + rng() * 4);
    }

    return grid;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.w && cy >= 0 && cy < this.h;
  }

  /** Out-of-bounds policy: side walls and floor are solid, sky is empty. */
  solidAt(cx: number, cy: number): boolean {
    if (cy >= this.h) return false;
    if (cx < 0 || cx >= this.w || cy < 0) return true;
    return this.cells[cy * this.w + cx] === 1;
  }

  solidAtWorld(wx: number, wy: number): boolean {
    return this.solidAt(Math.floor(wx / CELL_SIZE), Math.floor(wy / CELL_SIZE));
  }

  /** True when the axis-aligned box [x±halfW, y±halfH] overlaps no solid cell. */
  boxFree(wx: number, wy: number, halfW: number, halfH: number): boolean {
    const x0 = Math.floor((wx - halfW) / CELL_SIZE);
    const x1 = Math.floor((wx + halfW - 1e-6) / CELL_SIZE);
    const y0 = Math.floor((wy - halfH) / CELL_SIZE);
    const y1 = Math.floor((wy + halfH - 1e-6) / CELL_SIZE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.solidAt(cx, cy)) return false;
      }
    }
    return true;
  }

  /** Removes solid cells in a circle. Returns the number of cells removed. */
  carveCircle(wx: number, wy: number, r: number): number {
    const cx0 = Math.max(0, Math.floor((wx - r) / CELL_SIZE));
    const cx1 = Math.min(this.w - 1, Math.floor((wx + r) / CELL_SIZE));
    const cy0 = Math.max(0, Math.floor((wy - r) / CELL_SIZE));
    const cy1 = Math.min(this.h - 1, Math.floor((wy + r) / CELL_SIZE));
    const r2 = r * r;
    let removed = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = (cx + 0.5) * CELL_SIZE;
        const py = (cy + 0.5) * CELL_SIZE;
        const dx = px - wx;
        const dy = py - wy;
        if (dx * dx + dy * dy <= r2) {
          const i = cy * this.w + cx;
          if (this.cells[i] === 1) {
            this.cells[i] = 0;
            removed++;
          }
        }
      }
    }
    return removed;
  }

  /** World y of the terrain surface (top of highest solid cell) at world x. */
  surfaceY(wx: number): number {
    const cx = Math.min(this.w - 1, Math.max(0, Math.floor(wx / CELL_SIZE)));
    for (let cy = this.h - 1; cy >= 0; cy--) {
      if (this.cells[cy * this.w + cx] === 1) return (cy + 1) * CELL_SIZE;
    }
    return 0;
  }

  solidCount(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) n += this.cells[i];
    return n;
  }
}
