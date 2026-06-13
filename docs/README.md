# TankClash Documentation

TankClash is a real-time multiplayer artillery combat game on destructible
terrain — a 2.5D side-view slice rendered with **Three.js** over an
authoritative **Colyseus** server. Two armored vehicles duel on a procedurally
generated arena, aiming continuously, charging physics-based cannon shots,
reshaping the battlefield with craters, and fighting the wind.

The implemented scope spans **Milestone 3**: a lobby with **1v1 / 2v2 /
spectator** modes, **ten weapons**, **four arena layouts**, a minimap, real
craters and tunnels, wind, knockback, status effects (shield / burn), round
summaries, win/loss, round restart, and auto-reconnect.

## Index

| Document | What's inside |
| --- | --- |
| [Getting Started](getting-started.md) | Install, run (dev / prod), ports, controls, modes |
| [Architecture](architecture.md) | Module layout, the authoritative `GameSim`, server systems, the terrain grid, shared code |
| [Networking](networking.md) | Colyseus rooms, tick / patch rates, prediction + reconciliation, interpolation, the message protocol |
| [Gameplay](gameplay.md) | Weapons table, terrain layouts, wind, status effects, match flow, and the tuning constants |
| [Verification](verification.md) | The four objective gates (typecheck, tests, headless match, screenshots) |

## Technology stack

- **Client** — Three.js (rendering), Vite (build), TypeScript
- **Server** — Colyseus 0.16 on Node.js 22, Express health endpoint
- **Sync** — WebSocket state synchronization via Colyseus schema
- **Tests** — Vitest; Playwright for the screenshot gate

## Repository layout

```
shared/   constants, math (seeded RNG / noise), terrain grid, vehicle physics, weapons, types
server/   GameSim (authoritative) + systems, Colyseus room, bot AI, schema
client/   Three.js rendering, input, prediction, net, HUD, minimap
scripts/  matchSim + screenshot verification gates
tests/    vitest unit + reconciliation tests
docs/     this documentation
```

## Iteration history

The full loop-by-loop development log — what changed, which gates passed, and the
measured numbers — lives in [`PROGRESS.md`](../PROGRESS.md).
</content>
