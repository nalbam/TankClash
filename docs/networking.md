# Networking

TankClash is **server-authoritative**. The server decides match state, player
positions, health, projectile spawning, damage resolution, terrain destruction,
weapon cooldowns, round state, and win/loss. The client renders, collects input,
predicts the local tank, interpolates remote entities, and plays effects — it
never decides outcomes.

## Fixed rates

These are fixed by design (`shared/constants.ts`) and are not re-debated per
change:

| Parameter | Value | Constant |
| --- | --- | --- |
| Server simulation | **30 Hz** fixed timestep | `TICK_RATE` / `FIXED_DT` |
| State patches to clients | **20 Hz** | `PATCH_RATE` |
| Client interpolation buffer | **100 ms** | `INTERP_DELAY_MS` |
| Terrain destruction sync | crater **events** (center + radius), not full grid | — |

## Room loop

`TankClashRoom` (`server/rooms/TankClashRoom.ts`) drives one `GameSim`:

1. `setSimulationInterval` accumulates elapsed time and steps `fixedTick()`
   while a full `FIXED_DT` is available. The accumulator is **capped at
   5×`FIXED_DT`** so a stalled event loop cannot trigger a spiral of death.
2. Each `fixedTick` feeds every bot's `PlayerInput` through `setInput`, advances
   `sim.tick(FIXED_DT)`, and broadcasts the drained events.
3. `setPatchRate(1000 / PATCH_RATE)` sends schema deltas at 20 Hz.

A solo/bot match can be truly paused (the tick early-returns); a shared match
ignores pause so it never strands other players.

## Message protocol

Message names are the `MSG` constants in `shared/types.ts`.

### Client → server

| Message | Payload | Effect |
| --- | --- | --- |
| `input` | `PlayerInput` | Movement / aim / charge; coerced + bounded at the `setInput` boundary |
| `selectWeapon` | weapon id (string) | Switch active weapon (ignored mid-charge / non-selectable) |
| `setReady` | boolean | Lobby: toggle the player's ready flag |
| `selectTeam` | `"blue"` / `"red"` | Lobby: switch team (rejected if the side is full of humans) |
| `setSpectator` | boolean | Drop to / rejoin from spectating; mid-match this kills the tank |
| `startMatch` | — | Host-only: begin the start countdown |
| `restart` | — | Request to leave the win screen (returns the room to the lobby) |
| `pause` | boolean | Pause — only honored when ≤1 human is connected |
| `ping` | timestamp | Server echoes it back as `pong` (latency display) |

Lobby state (host, ready flags, team, spectator, countdown) is carried by the
**schema patches**, not discrete messages. The room browser reads open rooms
from a `GET /api/lobby` matchmaking feed (mode / phase / occupancy / host /
share code).

### Server → client

| Message | Payload | Purpose |
| --- | --- | --- |
| `terrainInit` | `{ seed, craters[] }` | Sent on join and on round reset — reconstruct terrain deterministically |
| `crater` | `CraterEvent` | A crater was carved (carve the local grid) |
| `explosion` | `ExplosionEvent` | Spawn explosion VFX |
| `fired` | `FiredEvent` | A shot was fired (muzzle VFX / audio) |
| `kill` | `KillEvent` | Kill feed |
| `pong` | timestamp | Round-trip for ping |

Continuous state (player positions, health, projectiles, phase, wind, round
time) flows through the **Colyseus schema patches** at 20 Hz, not through these
discrete messages.

## Deterministic terrain sync

Terrain destruction is synchronized as compact **crater events** (center +
radius), never as a full-grid dump. The client holds the same `TerrainGrid`,
generated from the `seed` it received in `terrainInit`, and carves each incoming
crater into its local copy. Because generation and carving are deterministic and
order-independent for disjoint craters, the client grid stays bit-for-bit
consistent with the server's.

On round reset the server regenerates terrain from a new seed and re-broadcasts
`terrainInit` so clients drop their crater history and rebuild.

## Client-side prediction + reconciliation

The local tank is **predicted** so input feels zero-latency, while remote
entities are **interpolated** for smoothness. This is implemented in
`client/net/predictor.ts` (`LocalPredictor`):

1. **Apply immediately.** Each sampled `PlayerInput` is run through
   `stepVehicle` locally and pushed onto a pending queue keyed by sequence
   number.
2. **Reconcile on each patch.** When an authoritative patch arrives, the
   predictor resets the body to the server state, then **replays every
   still-unacknowledged input** (those past the server's `lastSeq`) on top of
   it. Acknowledged inputs are dropped.
3. **Hard-snap on divergence.** If predicted and server positions diverge beyond
   `HARD_SNAP_DIST` (14 u) — e.g. a respawn or teleport — the predictor hard
   resets instead of replaying.

Because the predictor calls the *same* `stepVehicle` as the server
(`shared/physics.ts`), prediction error comes only from latency, never from
divergent logic. This is a clean foundation for rollback — the structure is in
place, but rollback is intentionally not implemented yet.

## Snapshot interpolation

Remote tanks and projectiles are rendered at `now − 100 ms`, lerping between the
two surrounding snapshots. This trades a fixed, small visual delay for smooth
motion under network jitter.

## Scope notes

- Prediction covers **movement only**; projectiles are server-spawned and shown
  via `fired` / schema, not locally predicted.
- No rollback yet — the netcode is structured for it but does not implement it.
- Reconnect-safe handling is supported where practical (a fresh join replays
  terrain init + craters).
</content>
