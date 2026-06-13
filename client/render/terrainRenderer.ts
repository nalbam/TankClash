import * as THREE from "three";
import { CELL_SIZE, GRID_H, GRID_W } from "@shared/constants";
import type { TerrainGrid } from "@shared/terrain";
import type { CraterEvent } from "@shared/types";

const CHUNK = 32; // cells per chunk side
const DEPTH = 7; // visual extrusion depth (z)

const COLOR_TOP = new THREE.Color("#f1e9d2"); // cream highlight
const COLOR_BODY_HI = new THREE.Color("#6b5a48");
const COLOR_BODY_LO = new THREE.Color("#2e2a33");
const COLOR_SIDE = new THREE.Color("#4a3f38");

/**
 * Renders the destructible solidity grid as chunked merged meshes.
 * Crater events mark intersecting chunks dirty; dirty chunks rebuild lazily
 * (bounded per frame) so destruction stays smooth.
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  private chunks: Array<THREE.Mesh | null>;
  private dirty = new Set<number>();
  private chunksX = Math.ceil(GRID_W / CHUNK);
  private chunksY = Math.ceil(GRID_H / CHUNK);
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(private terrain: TerrainGrid) {
    this.chunks = new Array(this.chunksX * this.chunksY).fill(null);
    this.rebuildAll(terrain);
  }

  rebuildAll(terrain: TerrainGrid): void {
    this.terrain = terrain;
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i);
  }

  onCrater(c: CraterEvent): void {
    const cx0 = Math.floor((c.x - c.r) / CELL_SIZE / CHUNK);
    const cx1 = Math.floor((c.x + c.r) / CELL_SIZE / CHUNK);
    const cy0 = Math.floor((c.y - c.r) / CELL_SIZE / CHUNK);
    const cy1 = Math.floor((c.y + c.r) / CELL_SIZE / CHUNK);
    for (let cy = Math.max(0, cy0); cy <= Math.min(this.chunksY - 1, cy1); cy++) {
      for (let cx = Math.max(0, cx0); cx <= Math.min(this.chunksX - 1, cx1); cx++) {
        this.dirty.add(cy * this.chunksX + cx);
      }
    }
  }

  /** Rebuild up to `budget` dirty chunks this frame. */
  update(budget = 6): void {
    let built = 0;
    for (const index of this.dirty) {
      this.rebuildChunk(index);
      this.dirty.delete(index);
      if (++built >= budget) break;
    }
  }

  private rebuildChunk(index: number): void {
    const old = this.chunks[index];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks[index] = null;
    }

    const chunkX = (index % this.chunksX) * CHUNK;
    const chunkY = Math.floor(index / this.chunksX) * CHUNK;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    const body = new THREE.Color();
    const pushQuad = (
      verts: [number, number, number][],
      normal: [number, number, number],
      color: THREE.Color,
    ) => {
      const [a, b, c, d] = verts;
      for (const v of [a, b, c, a, c, d]) positions.push(v[0], v[1], v[2]);
      for (let i = 0; i < 6; i++) {
        normals.push(normal[0], normal[1], normal[2]);
        colors.push(color.r, color.g, color.b);
      }
    };

    for (let cy = chunkY; cy < Math.min(chunkY + CHUNK, GRID_H); cy++) {
      for (let cx = chunkX; cx < Math.min(chunkX + CHUNK, GRID_W); cx++) {
        if (!this.terrain.solidAt(cx, cy)) continue;
        const x0 = cx * CELL_SIZE;
        const x1 = x0 + CELL_SIZE;
        const y0 = cy * CELL_SIZE;
        const y1 = y0 + CELL_SIZE;

        // Depth-shaded body color with a touch of per-cell variation.
        const depthT = Math.min(1, cy / (GRID_H * 0.6));
        const vary = ((cx * 31 + cy * 17) % 7) / 7;
        body.copy(COLOR_BODY_LO).lerp(COLOR_BODY_HI, depthT * 0.8 + vary * 0.2);

        // Front face (always).
        pushQuad(
          [
            [x0, y0, DEPTH / 2],
            [x1, y0, DEPTH / 2],
            [x1, y1, DEPTH / 2],
            [x0, y1, DEPTH / 2],
          ],
          [0, 0, 1],
          this.terrain.solidAt(cx, cy + 1) ? body : body.clone().lerp(COLOR_TOP, 0.25),
        );

        // Exposed top → cream highlight strip.
        if (!this.terrain.solidAt(cx, cy + 1)) {
          pushQuad(
            [
              [x0, y1, DEPTH / 2],
              [x1, y1, DEPTH / 2],
              [x1, y1, -DEPTH / 2],
              [x0, y1, -DEPTH / 2],
            ],
            [0, 1, 0],
            COLOR_TOP,
          );
        }
        // Exposed bottom (cave ceilings).
        if (!this.terrain.solidAt(cx, cy - 1) && cy > 0) {
          pushQuad(
            [
              [x0, y0, -DEPTH / 2],
              [x1, y0, -DEPTH / 2],
              [x1, y0, DEPTH / 2],
              [x0, y0, DEPTH / 2],
            ],
            [0, -1, 0],
            COLOR_SIDE,
          );
        }
        // Exposed left/right walls.
        if (!this.terrain.solidAt(cx - 1, cy)) {
          pushQuad(
            [
              [x0, y0, -DEPTH / 2],
              [x0, y0, DEPTH / 2],
              [x0, y1, DEPTH / 2],
              [x0, y1, -DEPTH / 2],
            ],
            [-1, 0, 0],
            COLOR_SIDE,
          );
        }
        if (!this.terrain.solidAt(cx + 1, cy)) {
          pushQuad(
            [
              [x1, y0, DEPTH / 2],
              [x1, y0, -DEPTH / 2],
              [x1, y1, -DEPTH / 2],
              [x1, y1, DEPTH / 2],
            ],
            [1, 0, 0],
            COLOR_SIDE,
          );
        }
      }
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.chunks[index] = mesh;
  }
}
