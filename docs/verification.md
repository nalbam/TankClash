# Verification

Self-scoring is not verification. Four **objective gates** guard every change and
must pass in order — they are the foundation that makes each development loop
verifiable. The per-loop results are recorded in [`PROGRESS.md`](../PROGRESS.md).

```bash
npm run typecheck   # 1. tsc, zero errors
npm test            # 2. vitest unit + reconciliation tests
npm run match:sim   # 3. headless bot-vs-bot match
npm run screenshot  # 4. Playwright boots server + client, captures a live match
```

A change that does not pass all four gates does not move on — the gate is fixed
first.

## 1. Typecheck

```bash
npm run typecheck   # tsc --noEmit
```

Passes with zero errors.

## 2. Unit tests

```bash
npm test            # vitest run
```

**50 tests** across eight files, covering the simulation's load-bearing logic:

| File | Covers |
| --- | --- |
| `physics.test.ts` (11) | Projectile gravity, wind, terrain / vehicle collision; vehicle stepping |
| `terrain.test.ts` (9) | Grid generation, crater carving, surface query, out-of-bounds policy (walls solid / floor absent / sky empty) |
| `status.test.ts` (7) | Shield reduction, burn DoT, kill attribution |
| `damage.test.ts` (6) | Splash falloff, direct-hit bonus, knockback, self-damage |
| `weapons.test.ts` (6) | Per-weapon behavior (charge, spread, cluster split, drill pierce, pull, support) |
| `match.test.ts` (4) | Round flow, sudden death, win detection, fall-death danger zone |
| `prediction.test.ts` (3) | Client prediction / reconciliation against authoritative state |
| `gamepad.test.ts` (4) | Gamepad → `PlayerInput` mapping |

## 3. Headless bot match

```bash
npm run match:sim   # tsx scripts/matchSim.ts
```

Runs the authoritative `GameSim` with two bots — **no networking, no
rendering** — possible only because the simulation is networking-free. It plays
**3 consecutive matches** and asserts:

- the match runs to completion and a winner is declared;
- no crash, no unhandled rejection;
- no `NaN` / `Infinity` in any position, velocity, or health value;
- terrain destruction events are applied consistently (the solid cell count
  actually drops and reroutes bots);
- server tick duration stays under budget (avg < 5 ms, max < 33 ms) — no death
  spiral.

Sudden death guarantees each match ends well before the
`MAX_SIM_SECONDS_PER_MATCH` (240 s) safety cap. Exits non-zero on any failure.

## 4. Screenshots

```bash
npm run screenshot  # tsx scripts/screenshot.ts
```

Launches server + client headlessly with **Playwright** (Chromium), joins a room
with a bot, and captures screenshots at fixed times (e.g. t=2 s, t=10 s,
t=30 s). The frames must show a **rendered battlefield** — never a blank or black
canvas — proving both tanks framed, the aim arc, projectiles in flight, and
visible terrain damage.

> Run `npx playwright install chromium` once before this gate.

Captured frames live in [`screenshots/`](../screenshots/). Headless FPS (~45) is
measured under software WebGL (SwiftShader); real GPUs render the slice far
faster.

## Known limitations

- Gamepad mapping is unit-tested, but live controller testing needs a physical
  pad; the keyboard/mouse path is what the screenshot gate exercises.
- Prediction covers movement only; projectiles are server-spawned, not locally
  predicted.
- No rollback yet — the netcode is structured for it but does not implement it.
- Drilling can leave visually floating terrain chunks (the solidity grid has no
  connectivity/collapse pass); physics stays consistent since collision reads the
  same grid.
- Bots don't yet path around freshly-opened pits, so they can occasionally fall
  into a fatal gap (matches still resolve).
- Bot aiming uses a closed-form ballistic solver (weapon-aware via
  `gravityScale`) with light wind compensation — competent, not expert.
</content>
