import { WIND } from "../../shared/constants";
import { moveToward, randRange } from "../../shared/math";
import type { GameState } from "../schema/GameState";

export interface WindRuntime {
  target: number;
  timer: number;
}

/** Wind drifts gradually toward a target that resamples every 8–15 s. */
export function stepWind(state: GameState, runtime: WindRuntime, rng: () => number, dt: number): void {
  runtime.timer -= dt;
  if (runtime.timer <= 0) {
    runtime.target = randRange(rng, -WIND.MAX, WIND.MAX);
    runtime.timer = randRange(rng, WIND.RESAMPLE_MIN_S, WIND.RESAMPLE_MAX_S);
  }
  state.wind = moveToward(state.wind, runtime.target, WIND.CHANGE_RATE * dt);
}
