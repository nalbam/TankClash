import { CELL_SIZE, GRID_H, GRID_W, WORLD_HEIGHT, WORLD_WIDTH } from "./constants";
import { createFbm1D, createRng } from "./math";

export const ARENA_LAYOUTS = ["hills", "plateau", "caverns", "islands"] as const;
export type ArenaLayout = (typeof ARENA_LAYOUTS)[number];

/** Deterministic layout choice from the seed — same on client and server. */
export function layoutForSeed(seed: number): ArenaLayout {
  return ARENA_LAYOUTS[(seed >>> 8) % ARENA_LAYOUTS.length];
}

// Spawn columns (matches GameSim spawn at 18% / 82% of world width).
const SPAWN_LX = Math.floor(WORLD_WIDTH * 0.18);
const SPAWN_RX = Math.floor(WORLD_WIDTH * 0.82);

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
    const layout = layoutForSeed(seed);
    const fbm = createFbm1D(seed, 4);
    const rng = createRng(seed ^ 0x5eed);

    // Each layout produces a surface-height profile (cells of solid ground per
    // column). The fill + cover-pocket carving is shared.
    const heights = TerrainGrid.heightProfile(layout, fbm, rng);

    for (let cx = 0; cx < GRID_W; cx++) {
      const top = Math.min(GRID_H, Math.max(0, heights[cx]));
      for (let cy = 0; cy < top; cy++) {
        grid.cells[cy * GRID_W + cx] = 1;
      }
    }

    // Caverns get many hollows; other layouts a few cover pockets.
    const pockets = layout === "caverns" ? 10 + Math.floor(rng() * 6) : 3 + Math.floor(rng() * 3);
    for (let i = 0; i < pockets; i++) {
      const cx = Math.floor((0.1 + rng() * 0.8) * GRID_W);
      const surface = heights[cx] * CELL_SIZE;
      const wy = surface * (0.35 + rng() * 0.55);
      grid.carveCircle(cx * CELL_SIZE, wy, 3 + rng() * 4);
    }

    return grid;
  }

  /** Column heights (in cells) for a layout. Always leaves footing at spawns. */
  private static heightProfile(
    layout: ArenaLayout,
    fbm: (x: number) => number,
    rng: () => number,
  ): number[] {
    const heights = new Array<number>(GRID_W);
    const base = WORLD_HEIGHT / CELL_SIZE;

    for (let cx = 0; cx < GRID_W; cx++) {
      const n = fbm(cx * 0.015);
      let h: number;
      switch (layout) {
        case "plateau": {
          // High flat mesa with a deep central chasm.
          const flat = 0.5 + n * 0.06;
          const center = Math.abs(cx / GRID_W - 0.5);
          const chasm = center < 0.12 ? 1 - (0.12 - center) / 0.12 : 1;
          h = base * flat * (0.25 + 0.75 * chasm);
          break;
        }
        case "caverns": {
          // Thick massif (hollowed out by extra pockets afterward).
          h = base * (0.62 + n * 0.22);
          break;
        }
        case "islands": {
          // Three peaks (two at the spawns) separated by deep gaps.
          const peaks = [SPAWN_LX, Math.floor(GRID_W / 2), SPAWN_RX];
          let peak = 0;
          for (const px of peaks) {
            const d = Math.abs(cx - px) / (GRID_W * 0.12);
            peak = Math.max(peak, Math.exp(-d * d));
          }
          h = base * (0.12 + 0.42 * peak + n * 0.05);
          break;
        }
        case "hills":
        default:
          h = base * (0.22 + n * 0.33);
          break;
      }
      heights[cx] = Math.round(h);
    }

    // Guarantee a flat landing pad at each spawn column.
    TerrainGrid.flattenAround(heights, SPAWN_LX);
    TerrainGrid.flattenAround(heights, SPAWN_RX);
    return heights;
  }

  private static flattenAround(heights: number[], cx: number, radius = 6): void {
    const target = Math.max(heights[cx], Math.round((WORLD_HEIGHT / CELL_SIZE) * 0.2));
    for (let i = -radius; i <= radius; i++) {
      const x = cx + i;
      if (x >= 0 && x < heights.length) heights[x] = target;
    }
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.w && cy >= 0 && cy < this.h;
  }

  /**
   * Out-of-bounds policy: side walls are solid (tanks can't leave horizontally),
   * but there is NO world floor — falling below the terrain is a lethal danger
   * zone, and the sky is empty.
   */
  solidAt(cx: number, cy: number): boolean {
    if (cy >= this.h) return false; // sky
    if (cy < 0) return false; // bottomless pit (deadly)
    if (cx < 0 || cx >= this.w) return true; // side walls
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
