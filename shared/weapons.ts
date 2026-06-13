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
  /** Projectile/trail color (client visual identity). */
  color: number;
  /** Explosion tint (client visual identity). */
  explosionColor: number;

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
  /** Gravity Bomb: explosion pulls toward the center instead of pushing away. */
  pull?: boolean;
  /** Napalm: apply burn (damage-over-time) to enemies in the splash radius. */
  burnDuration?: number;
  /** Team support (Shield Grenade / Repair Foam): affects allies, not enemies. */
  teamSupport?: { shieldDuration?: number; heal?: number };
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
  color: 0xffd27a,
  explosionColor: 0xff8c2e,
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
  color: 0xff6a3a,
  explosionColor: 0xff4422,
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
  color: 0xfff07a,
  explosionColor: 0xffd24a,
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
  color: 0x9d7bff,
  explosionColor: 0xb86aff,
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
  color: 0xff3df0,
  explosionColor: 0xff3df0,
  pierce: 26,
  pierceRadius: 1.5,
};

export const RAILGUN: WeaponDef = {
  ...BASE,
  id: "railgun",
  name: "Railgun",
  // Hyper-velocity flat shot — near-instant, high damage, demands aim.
  minSpeed: 210,
  maxSpeed: 280,
  chargeTime: 1.6,
  craterRadius: 2,
  splashRadius: 2.5,
  damageMax: 30,
  directBonus: 28,
  knockback: 16,
  projectileRadius: 0.3,
  windInfluence: 0,
  cooldown: 1.9,
  selfDamageScale: 0,
  gravityScale: 0,
  color: 0x6ad8ff,
  explosionColor: 0x9be8ff,
};

export const GRAVITY_BOMB: WeaponDef = {
  ...BASE,
  id: "gravity",
  name: "Gravity Bomb",
  // Implodes — pulls everyone toward the blast (combo into hazards/holes).
  minSpeed: 38,
  maxSpeed: 78,
  chargeTime: 1.3,
  craterRadius: 3,
  splashRadius: 10,
  damageMax: 16,
  directBonus: 6,
  knockback: 40,
  projectileRadius: 0.5,
  windInfluence: 0.7,
  cooldown: 2.1,
  selfDamageScale: 0.3,
  gravityScale: 0.9,
  color: 0xb84dff,
  explosionColor: 0xc77bff,
  pull: true,
};

export const NAPALM: WeaponDef = {
  ...BASE,
  id: "napalm",
  name: "Napalm",
  // Low burst, strong burn DoT — area denial / finisher.
  minSpeed: 34,
  maxSpeed: 76,
  chargeTime: 1.2,
  craterRadius: 3,
  splashRadius: 6,
  damageMax: 14,
  directBonus: 8,
  knockback: 12,
  projectileRadius: 0.45,
  windInfluence: 0.8,
  cooldown: 1.6,
  selfDamageScale: 0.5,
  gravityScale: 1,
  color: 0xff5a1e,
  explosionColor: 0xff7a2e,
  burnDuration: 4,
};

export const SHIELD_GRENADE: WeaponDef = {
  ...BASE,
  id: "shield",
  name: "Shield Grenade",
  // Support: shields allies in the burst (no enemy damage).
  minSpeed: 36,
  maxSpeed: 74,
  chargeTime: 1,
  craterRadius: 0,
  splashRadius: 7,
  damageMax: 0,
  directBonus: 0,
  knockback: 0,
  projectileRadius: 0.5,
  windInfluence: 0.7,
  cooldown: 2.6,
  selfDamageScale: 0,
  gravityScale: 1,
  color: 0x4dffd0,
  explosionColor: 0x4dffd0,
  teamSupport: { shieldDuration: 6 },
};

export const REPAIR_FOAM: WeaponDef = {
  ...BASE,
  id: "repair",
  name: "Repair Foam",
  // Support: heals allies in the burst (no enemy damage).
  minSpeed: 36,
  maxSpeed: 74,
  chargeTime: 1.1,
  craterRadius: 0,
  splashRadius: 6,
  damageMax: 0,
  directBonus: 0,
  knockback: 0,
  projectileRadius: 0.5,
  windInfluence: 0.7,
  cooldown: 3,
  selfDamageScale: 0,
  gravityScale: 1,
  color: 0x6affa0,
  explosionColor: 0x6affa0,
  teamSupport: { heal: 42 },
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
  color: 0xffb24a,
  explosionColor: 0xff8c2e,
};

export const WEAPONS: Record<string, WeaponDef> = {
  cannon: CANNON,
  mortar: MORTAR,
  shotgun: SHOTGUN,
  cluster: CLUSTER,
  drill: DRILL,
  railgun: RAILGUN,
  gravity: GRAVITY_BOMB,
  napalm: NAPALM,
  shield: SHIELD_GRENADE,
  repair: REPAIR_FOAM,
  bomblet: BOMBLET,
};

/** Ordered list for number-key selection (1..0 → indices 0..9). */
export const SELECTABLE_WEAPONS: WeaponDef[] = [
  CANNON,
  MORTAR,
  SHOTGUN,
  CLUSTER,
  DRILL,
  RAILGUN,
  GRAVITY_BOMB,
  NAPALM,
  SHIELD_GRENADE,
  REPAIR_FOAM,
];
