import type { TerrainGrid } from "../../shared/terrain";
import type { CraterEvent } from "../../shared/types";
import type { SimEvents } from "../simEvents";

/**
 * Carves a crater, records it in the persistent history (for late joiners)
 * and queues the event for broadcast. Returns cells removed.
 */
export function carveCrater(
  terrain: TerrainGrid,
  craters: CraterEvent[],
  events: SimEvents,
  x: number,
  y: number,
  r: number,
): number {
  const removed = terrain.carveCircle(x, y, r);
  const event: CraterEvent = { x, y, r };
  craters.push(event);
  events.craters.push(event);
  return removed;
}
