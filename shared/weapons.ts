export interface WeaponDef {
  id: string;
  name: string;
  /** Muzzle speed at zero charge. */
  minSpeed: number;
  /** Muzzle speed at full charge. */
  maxSpeed: number;
  /** Seconds of holding to reach full charge. */
  chargeTime: number;
  /** Terrain crater radius (world units). */
  craterRadius: number;
  /** Splash damage radius (world units). */
  splashRadius: number;
  /** Damage at explosion center. */
  damageMax: number;
  /** Extra damage on a direct vehicle hit. */
  directBonus: number;
  /** Knockback impulse at explosion center. */
  knockback: number;
  projectileRadius: number;
  /** 1 = full wind effect, 0 = immune. */
  windInfluence: number;
  /** Seconds between shots. */
  cooldown: number;
  selfDamageScale: number;
  /** Gravity multiplier (1 = normal arc, <1 = flatter/driving). */
  gravityScale: number;
  /** Shown in the weapon HUD and selectable with number keys. */
  selectable: boolean;

  // --- Behavior modifiers (absent = plain single projectile) ---
  /** Shotgun: fire this many projectiles in a spread cone. */
  pellets?: number;
  /** Shotgun spread half-angle (radians). */
  spread?: number;
  /** Cluster: on impact, spawn child projectiles of this weapon. */
  splitOnImpact?: { count: number; weapon: string; speed: number };
  /** Drill: tunnel through this many ticks of terrain before detonating. */
  pierce?: number;
  /** Drill tunnel carve radius per tick. */
  pierceRadius?: number;
}

const BASE: Pick<WeaponDef, "gravityScale" | "selectable"> = { gravityScale: 1, selectable: true };

export const CANNON: WeaponDef = {
  ...BASE,
  id: "cannon",
  name: "Cannon",
  minSpeed: 30,
  maxSpeed: 85,
  chargeTime: 1.4,
  craterRadius: 4.5,
  splashRadius: 6,
  damageMax: 34,
  directBonus: 14,
  knockback: 26,
  projectileRadius: 0.45,
  windInfluence: 1,
  cooldown: 0.9,
  selfDamageScale: 0.6,
};

export const MORTAR: WeaponDef = {
  ...BASE,
  id: "mortar",
  name: "Mortar",
  // Slow and heavy → towering arc that drops behind cover.
  minSpeed: 24,
  maxSpeed: 58,
  chargeTime: 1.6,
  craterRadius: 6.5,
  splashRadius: 8.5,
  damageMax: 44,
  directBonus: 10,
  knockback: 32,
  projectileRadius: 0.55,
  windInfluence: 0.5,
  cooldown: 1.7,
  selfDamageScale: 0.7,
  gravityScale: 1.35,
};

export const SHOTGUN: WeaponDef = {
  ...BASE,
  id: "shotgun",
  name: "Shotgun Shell",
  // Fast pellet spray — devastating up close, scatters at range.
  minSpeed: 55,
  maxSpeed: 100,
  chargeTime: 0.6,
  craterRadius: 1.6,
  splashRadius: 2.4,
  damageMax: 12,
  directBonus: 6,
  knockback: 10,
  projectileRadius: 0.3,
  windInfluence: 0.3,
  cooldown: 0.8,
  selfDamageScale: 0.5,
  gravityScale: 0.85,
  pellets: 6,
  spread: 0.22,
};

export const CLUSTER: WeaponDef = {
  ...BASE,
  id: "cluster",
  name: "Cluster Rocket",
  // Direct rocket that bursts into bomblets — area denial.
  minSpeed: 45,
  maxSpeed: 90,
  chargeTime: 1.2,
  craterRadius: 2.5,
  splashRadius: 3.5,
  damageMax: 16,
  directBonus: 10,
  knockback: 16,
  projectileRadius: 0.45,
  windInfluence: 0.6,
  cooldown: 1.4,
  selfDamageScale: 0.6,
  gravityScale: 0.7,
  splitOnImpact: { count: 5, weapon: "bomblet", speed: 18 },
};

export const DRILL: WeaponDef = {
  ...BASE,
  id: "drill",
  name: "Drill Missile",
  // Tunnels through terrain, then detonates — defeats cover, reshapes arena.
  minSpeed: 40,
  maxSpeed: 72,
  chargeTime: 1.3,
  craterRadius: 3.5,
  splashRadius: 4.5,
  damageMax: 30,
  directBonus: 16,
  knockback: 18,
  projectileRadius: 0.4,
  windInfluence: 0,
  cooldown: 1.5,
  selfDamageScale: 0.5,
  gravityScale: 0.15,
  pierce: 26,
  pierceRadius: 1.5,
};

/** Cluster child — not directly selectable. */
export const BOMBLET: WeaponDef = {
  ...BASE,
  id: "bomblet",
  name: "Bomblet",
  minSpeed: 0,
  maxSpeed: 0,
  chargeTime: 0,
  craterRadius: 2,
  splashRadius: 3,
  damageMax: 12,
  directBonus: 4,
  knockback: 10,
  projectileRadius: 0.3,
  windInfluence: 0.5,
  cooldown: 0,
  selfDamageScale: 0.5,
  gravityScale: 1,
  selectable: false,
};

export const WEAPONS: Record<string, WeaponDef> = {
  cannon: CANNON,
  mortar: MORTAR,
  shotgun: SHOTGUN,
  cluster: CLUSTER,
  drill: DRILL,
  bomblet: BOMBLET,
};

/** Ordered list for number-key selection (1..N). */
export const SELECTABLE_WEAPONS: WeaponDef[] = [CANNON, MORTAR, SHOTGUN, CLUSTER, DRILL];
