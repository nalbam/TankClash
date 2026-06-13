import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import type { TerrainGrid } from "@shared/terrain";
import type { PlayerView } from "../net/colyseusClient";

const TEAM_COLORS: Record<string, string> = { blue: "#4da3ff", red: "#ff5d5d" };

/**
 * Top-right minimap: a downsampled terrain silhouette (rebuilt only when the
 * terrain changes) with live team-colored tank markers drawn on top.
 */
export class Minimap {
  private canvas = document.getElementById("minimap") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private terrainImage: ImageData;
  private w = this.canvas.width;
  private h = this.canvas.height;

  constructor() {
    this.terrainImage = this.ctx.createImageData(this.w, this.h);
  }

  /** Recompute the terrain silhouette by block-sampling the solidity grid. */
  rebuild(terrain: TerrainGrid): void {
    const img = this.terrainImage;
    const data = img.data;
    const stepX = terrain.w / this.w;
    const stepY = terrain.h / this.h;
    for (let py = 0; py < this.h; py++) {
      // Canvas y is top-down; world y is bottom-up.
      const gy = Math.floor((this.h - 1 - py) * stepY);
      for (let px = 0; px < this.w; px++) {
        const gx = Math.floor(px * stepX);
        const solid = terrain.solidAt(gx, gy);
        const i = (py * this.w + px) * 4;
        if (solid) {
          const shade = 70 + Math.floor((gy / terrain.h) * 80);
          data[i] = shade * 0.7;
          data[i + 1] = shade * 0.62;
          data[i + 2] = shade * 0.5;
          data[i + 3] = 255;
        } else {
          data[i] = 16;
          data[i + 1] = 24;
          data[i + 2] = 46;
          data[i + 3] = 220;
        }
      }
    }
  }

  update(terrain: TerrainGrid, players: Map<string, PlayerView>, localId: string, terrainDirty: boolean): void {
    if (terrainDirty) this.rebuild(terrain);
    this.ctx.putImageData(this.terrainImage, 0, 0);

    for (const [id, p] of players) {
      if (!p.alive) continue;
      const px = (p.x / WORLD_WIDTH) * this.w;
      const py = (1 - p.y / WORLD_HEIGHT) * this.h;
      this.ctx.fillStyle = TEAM_COLORS[p.team] ?? "#ffffff";
      const r = id === localId ? 2.5 : 2;
      this.ctx.beginPath();
      this.ctx.arc(px, py, r, 0, Math.PI * 2);
      this.ctx.fill();
      if (id === localId) {
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
    }
  }
}
