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
}

export const CANNON: WeaponDef = {
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

export const WEAPONS: Record<string, WeaponDef> = {
  cannon: CANNON,
};
