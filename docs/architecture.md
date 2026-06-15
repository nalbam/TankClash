# Architecture

TankClash is split into three source trees with a strict dependency direction:
`client/` and `server/` both depend on `shared/`, and `shared/` depends on
nothing else. Everything that must behave identically on both sides — terrain,
vehicle physics, weapon definitions, constants, math — lives in `shared/`, so
the client predicts with the exact code the server runs.

```
shared/  ← server/   (authoritative simulation)
   ↑
   └────── client/   (rendering + prediction)
```

## `shared/` — the common truth

| File | Responsibility |
| --- | --- |
| `constants.ts` | Timing (tick / patch rates), world/grid size, vehicle physics, wind, status, match flow — all the fixed numbers |
| `math.ts` | Seeded RNG, 1-D fBm noise, `clamp`, `randRange` — deterministic helpers |
| `terrain.ts` | `TerrainGrid`: the destructible 2D solidity grid + generation |
| `physics.ts` | `stepVehicle` behind a `VehicleBody` interface — runs server-side and in the client predictor |
| `weapons.ts` | `WeaponDef` and the ten weapon definitions (+ the cluster `bomblet`) |
| `types.ts` | `PlayerInput`, the event payloads, and the `MSG` protocol constants |

### Terrain: a destructible solidity grid

The terrain representation is **fixed** and deliberately *not* a heightmap —
tunnels and overhangs are required, and a heightmap cannot represent them.

`TerrainGrid` (`shared/terrain.ts`) is a row-major `Uint8Array` of `1 = solid /
0 = empty` cells (`GRID_W × GRID_H`, derived from `WORLD_WIDTH/HEIGHT` ÷
`CELL_SIZE`). It is generated **deterministically from a seed**:

1. `layoutForSeed(seed)` picks one of four layouts — `hills`, `plateau`,
   `caverns`, `islands`.
2. A per-column height profile is built from seeded fBm noise, with a guaranteed
   flat landing pad flattened around each spawn column (18% / 82% of world
   width).
3. Cover pockets are carved with `carveCircle` (many for `caverns`, a few for
   the others).

Key methods:

- `solidAt(cx, cy)` / `solidAtWorld(wx, wy)` — solidity query. **Out-of-bounds
  policy:** side walls are solid (tanks can't leave horizontally), the sky is
  empty, and there is **no world floor** — falling below the terrain is a lethal
  danger zone.
- `boxFree(...)` — AABB-vs-grid overlap test (vehicle collision).
- `carveCircle(wx, wy, r)` — removes solid cells in a circle (crater / tunnel),
  returns the count removed.
- `surfaceY(wx)` — world-y of the topmost solid cell (spawning, surface walk).

Because generation is deterministic, the client reconstructs the *exact* arena
from `seed` + the replayed list of crater events — see
[Networking](networking.md).

### Shared vehicle physics

`shared/physics.ts` exposes `stepVehicle(body, terrain, dt)` operating on a
`VehicleBody` interface (position, velocity, grounded flag, dash cooldown,
input). The server's `physicsSystem` re-exports it, and the client's
`LocalPredictor` calls the identical function — so predicted and authoritative
movement cannot drift due to differing logic.

## `server/` — the authoritative simulation

### `GameSim` — networking-free core

`server/GameSim.ts` is the heart: a single class that owns the `GameState`
schema, the `TerrainGrid`, the crater history, and a per-tick event buffer. It is
written **free of any networking concern**, which is what makes it testable:

- The Colyseus room drives it on a fixed timestep (production).
- The headless `match:sim` harness drives the *identical class* with no socket.

Its surface:

- `addPlayer / removePlayer` — alternates teams (`blue` / `red`) by join order,
  spawns on a layout's landing pad.
- `setInput(id, raw)` — the **network boundary**: every field coming from a
  client is coerced and bounded (aim clamped to ±π, booleans forced, sequence
  numbers validated) before it touches the simulation.
- `tick(dt)` — advances wind, then (when `phase === "playing"`) status effects,
  weapons, vehicles, and projectiles, then match flow; resets the round on
  request.
- `selectWeapon` / `requestRestart` — guarded state transitions.
- `drainEvents()` — hands the room this tick's craters / explosions / fired /
  kills to broadcast.

### Systems

`tick` is a thin orchestrator; the behavior lives in single-responsibility
systems under `server/systems/`:

| System | Responsibility |
| --- | --- |
| `physicsSystem` | Vehicle stepping (re-exports `stepVehicle`) and projectile integration (gravity, wind, terrain/vehicle collision) |
| `weaponSystem` | Charge accumulation, cooldowns, projectile spawning |
| `damageSystem` | `applyExplosion` (splash falloff, direct-hit bonus, knockback, self-damage, pull, burn, team support) and `stepStatus` (shield / burn ticks) |
| `terrainSystem` | `carveCrater` — applies a crater to the grid and records the event |
| `windSystem` | Gradual wind drift toward a periodically resampled target |
| `matchSystem` | Lobby / countdown gating, round timer, sudden death, win detection, end-pause, restart (or return-to-lobby) |

Cluster weapons and drills are handled in `GameSim` itself: a drill carves a
tunnel each tick until its `pierce` budget is spent, then detonates; a cluster
detonation deterministically fans child `bomblet` projectiles upward (no RNG, so
it stays reproducible).

### Schema

`server/schema/` defines the Colyseus-synchronized state — `GameState`
(phase, wind, round time, winner, host, countdown, the `players` and
`projectiles` maps), `PlayerState` (incl. `ready` / `spectator`), and
`ProjectileState`. Networked rooms run `lobby → countdown → playing → ended →
lobby`; the headless sim runs `waiting → playing → ended`. The lobby/ready/host
logic is driven by `GameSim` (constructed with `{ lobbyMode: true }`) so the
networking-free path keeps auto-starting unchanged.

### Room & bots

`server/rooms/TankClashRoom.ts` is the only networking-aware piece: it creates a
`GameSim` (`lobbyMode: true`), runs the fixed-timestep accumulator loop (capped
at 5×`FIXED_DT` to avoid a spiral of death), sets the patch rate, routes client
messages, and broadcasts drained events. It also owns the lobby policy:
`reconcileBots` keeps each side filled to `fillTo / 2` (humans first, bots topping
up — so a joining human displaces a bot), routes join/leave to player-vs-spectator
slots, and publishes matchmaking metadata (mode / phase / occupancy / host) for
the `GET /api/lobby` room browser. Bot AI brains live in the room; their
`PlayerState` lives in the sim.

`server/bots/BotController` produces the **exact same `PlayerInput`** a human
client sends — it moves, aims with a closed-form ballistic solver (weapon-aware
via `gravityScale`, with light wind compensation), dodges, seeks cover when
damaged, and occasionally misses. Bots obey identical rules because they go
through the same `setInput` path.

## `client/` — rendering & prediction

The client renders interpolated state and never decides outcomes.

| Area | Files |
| --- | --- |
| Rendering | `render/scene.ts`, `camera.ts`, `effects.ts`, `terrainRenderer.ts`, `vehicleRenderer.ts`, `trajectory.ts` |
| Net | `net/colyseusClient.ts`, `net/predictor.ts` |
| Input | `input/input.ts` (keyboard / mouse / gamepad) |
| UI | `ui/hud.ts`, `ui/minimap.ts`, `ui/lobby.ts` (room browser + lobby panel) |
| Audio | `audio/audio.ts` |
| Entry | `main.ts` |

- **Terrain** is drawn as chunked merged meshes that rebuild lazily only where
  craters land, generated from the same `TerrainGrid` the server uses.
- **Camera** frames the local tank together with the nearest enemy, dynamically
  zooming so both stay on screen, with cinematic shake on impacts.
- **Trajectory** previews the shot arc client-side using the exact server weapon
  constants, stopping at the terrain hit.
- **Prediction** (`LocalPredictor`) renders the local tank with zero input
  latency; remote tanks use snapshot interpolation. See
  [Networking](networking.md).

## Verification harness

`scripts/matchSim.ts` and `scripts/screenshot.ts` are the headless gates. The
match-sim driving `GameSim` directly (no socket) is only possible because the
simulation is networking-free — see [Verification](verification.md).
</content>
