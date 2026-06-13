import type { CraterEvent, ExplosionEvent, FiredEvent, KillEvent } from "../shared/types";

/** Per-tick event queues, drained by the room (broadcast) or the headless sim. */
export interface SimEvents {
  craters: CraterEvent[];
  explosions: ExplosionEvent[];
  fired: FiredEvent[];
  kills: KillEvent[];
}

export function createSimEvents(): SimEvents {
  return { craters: [], explosions: [], fired: [], kills: [] };
}
