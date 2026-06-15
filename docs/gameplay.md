# Gameplay & Tuning

All gameplay numbers live in two files so they are easy to tune without touching
logic: `shared/constants.ts` (movement, wind, status, match) and
`shared/weapons.ts` (per-weapon stats). Because these are in `shared/`, the same
values drive the server, the client predictor, and the bots.

## Movement

Vehicles are responsive but heavy (`VEHICLE` in `shared/constants.ts`):

| Constant | Value | Meaning |
| --- | --- | --- |
| `MAX_SPEED` | 18 u/s | Top horizontal speed |
| `ACCEL` / `AIR_ACCEL` | 70 / 25 | Ground vs. air acceleration |
| `FRICTION` | 50 | Ground deceleration |
| `JUMP_VELOCITY` | 24 | Jump impulse |
| `DASH_SPEED` / `DASH_COOLDOWN` | 35 / 2 s | Dash burst and its cooldown |
| `STEP_UP` | 1.5 u | Slope height climbable per step |
| `GRAVITY` | −50 | World gravity |

Jump, dash, recoil, and blast knockback all feed the same velocity, so movement
and combat share one physics model. Slopes are walked by the `STEP_UP` climb;
collision reads the solidity grid via `boxFree`.

## Weapons

Ten selectable weapons (`shared/weapons.ts`), each with its own projectile /
explosion color, cooldown, and terrain interaction. Number keys `1`–`9`, `0` map
to indices 0–9.

| # | Weapon | Role | Notable stats |
| --- | --- | --- | --- |
| 1 | Cannon | Balanced charge arc — the all-rounder | crater 4.5, splash 6, 34 (+14 direct), knock 26 |
| 2 | Mortar | Heavy high-arc lobber; drops behind cover | `gravityScale` 1.35, crater 6.5, 44 dmg |
| 3 | Shotgun Shell | 6-pellet spread; brutal up close | `pellets` 6, `spread` 0.22 |
| 4 | Cluster Rocket | Flat rocket bursting into bomblets — area denial | `splitOnImpact` → 5× bomblet |
| 5 | Drill Missile | Tunnels through terrain, then detonates | `pierce` 26, `pierceRadius` 1.5 |
| 6 | Railgun | Hyper-velocity flat shot; near-instant | speed 210–280, `gravityScale` 0, +28 direct |
| 7 | Gravity Bomb | Implodes — pulls victims inward toward hazards | `pull: true`, splash 10, knock 40 |
| 8 | Napalm | Low burst, strong burn DoT | `burnDuration` 4 s |
| 9 | Shield Grenade | Team support: shields allies in the burst | `teamSupport.shieldDuration` 6 s |
| 0 | Repair Foam | Team support: heals allies in the burst | `teamSupport.heal` 42 |

The `WeaponDef` interface documents every field. Behavior modifiers (`pellets`,
`splitOnImpact`, `pierce`, `pull`, `burnDuration`, `teamSupport`) are absent on
plain projectiles. The cluster `bomblet` is a non-selectable child weapon.

Charge: holding fire accumulates from `minSpeed` to `maxSpeed` over `chargeTime`
seconds; release fires at the accumulated muzzle speed. Damage falls off with
distance from the explosion center, a **direct vehicle hit** adds `directBonus`,
and `selfDamageScale` scales blast damage back onto the firer.

## Terrain layouts

Arenas rotate each round between four deterministic layouts (`shared/terrain.ts`,
chosen by `layoutForSeed`):

- **hills** — gentle rolling noise terrain.
- **plateau** — a high flat mesa split by a deep central chasm.
- **caverns** — a thick massif hollowed out with many cover pockets (tunnels).
- **islands** — three peaks (two at the spawns) over deep, fatal gaps.

Every layout flattens a guaranteed landing pad around each spawn column. Terrain
is fully destructible: craters and drill tunnels reshape cover, line-of-sight,
and movement mid-match, and the headless harness asserts that destruction
actually reroutes bots.

> **Danger zone.** There is no world floor. Falling through a fully-destroyed
> column keeps dropping until `FALL_KILL_Y` (−5) triggers an instant death.

## Wind

Wind is a key identity feature and must feel fair, not random (`WIND`):

- Drifts **gradually** toward a target at `CHANGE_RATE` 1.5 u/s² per second.
- The target is resampled every **8–15 s** (`RESAMPLE_MIN_S` / `RESAMPLE_MAX_S`).
- Capped at `MAX` ±10 u/s² of horizontal acceleration on projectiles.
- Affects light projectiles more than heavy ones via each weapon's
  `windInfluence` (1 = full, 0 = immune — e.g. Railgun and Drill ignore wind).

Wind is server-synchronized and shown in the HUD and through background
particles, creating tactical timing windows.

## Status effects

`STATUS` in `shared/constants.ts`:

- **Shield** (`SHIELD_REDUCTION` 0.55) — reduces incoming damage while active
  (Shield Grenade).
- **Burn** (`BURN_DPS` 9) — ticks damage over time (Napalm), credited to the
  applier so kills attribute correctly.

## Match flow

`MATCH` constants, driven by `matchSystem`:

- Rounds run **120 s** (`ROUND_TIME_S`).
- After time expires, **sudden death** decays everyone's health at
  `SUDDEN_DEATH_DPS` 2/s so a match always resolves (the headless harness relies
  on this to stay finite).
- On a win the world holds for `END_PAUSE_S` 4 s on the win screen.
- Round reset regenerates terrain from a new seed, clears projectiles, respawns
  fighters, and reseeds wind.

Phases depend on how the `GameSim` is driven:

- **Networked rooms** (`lobbyMode`): `lobby` → `countdown` → `playing` →
  `ended` → back to `lobby`. The host starts the countdown — `COUNTDOWN_ALL_READY_S`
  3 s if every human is ready, else `COUNTDOWN_DEFAULT_S` 10 s. Spectators are
  excluded from spawns and win checks; leaving mid-match turns a fighter into a
  spectator (a self-credited kill in the feed).
- **Headless / solo** (`matchSim`, unit tests): `waiting` → `playing` → `ended`
  → auto-restart, auto-starting once two fighters are present. This is what keeps
  the bot-only harness finite and self-driving.

## Bots

Server-side bots (`server/bots/BotController`) move around terrain, aim with a
weapon-aware ballistic solver and light wind compensation, fire, choose
reasonable power, dodge incoming shots, seek cover when damaged, and occasionally
miss. They produce the identical `PlayerInput` a human sends, so they play by the
same rules — which is what makes them usable for the headless verification gates.
</content>
