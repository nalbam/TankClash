// Simulation timing — fixed by PROMPT.md, do not re-debate per loop.
export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;
export const PATCH_RATE = 20;
export const INTERP_DELAY_MS = 100;

// World / terrain grid
export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 90;
export const CELL_SIZE = 0.5;
export const GRID_W = Math.round(WORLD_WIDTH / CELL_SIZE);
export const GRID_H = Math.round(WORLD_HEIGHT / CELL_SIZE);

// Physics
export const GRAVITY = -50;

export const VEHICLE = {
  HALF_W: 1.5,
  HALF_H: 1.0,
  ACCEL: 70,
  AIR_ACCEL: 25,
  MAX_SPEED: 18,
  FRICTION: 50,
  JUMP_VELOCITY: 24,
  STEP_UP: 1.5, // world units a vehicle can climb per step (slopes)
  DASH_SPEED: 35,
  DASH_COOLDOWN: 2.0,
  MAX_FALL: -60,
} as const;

export const PLAYER_MAX_HEALTH = 100;

// Wind
export const WIND = {
  MAX: 10, // max |acceleration| applied to projectiles (units/s^2)
  CHANGE_RATE: 1.5, // units/s^2 per second toward target
  RESAMPLE_MIN_S: 8,
  RESAMPLE_MAX_S: 15,
} as const;

// Status effects
export const STATUS = {
  SHIELD_REDUCTION: 0.55, // incoming damage multiplier reduction while shielded
  BURN_DPS: 9,
} as const;

// Match flow
export const MATCH = {
  ROUND_TIME_S: 120,
  SUDDEN_DEATH_DPS: 2, // health decay per second after round time
  END_PAUSE_S: 4, // pause on win screen before returning to the lobby
  FALL_KILL_Y: -5, // below world bottom = death zone
  COUNTDOWN_ALL_READY_S: 3, // host start delay when every human is ready
  COUNTDOWN_DEFAULT_S: 10, // host start delay when someone is not ready
} as const;
