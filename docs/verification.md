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

**69 tests** across nine files, covering the simulation's load-bearing logic:

| File | Covers |
| --- | --- |
| `physics.test.ts` (15) | Projectile gravity, wind, terrain / vehicle collision; vehicle stepping, body tilt and aim-elevation limits |
| `terrain.test.ts` (10) | Grid generation, crater carving, surface query, out-of-bounds policy (walls solid / floor absent / sky empty), per-layout generation + spawn footing |
| `status.test.ts` (7) | Shield reduction, burn DoT, kill attribution |
| `damage.test.ts` (6) | Splash falloff, direct-hit bonus, knockback, self-damage |
| `weapons.test.ts` (6) | Per-weapon behavior (charge, spread, cluster split, drill pierce, pull, support) |
| `match.test.ts` (4) | Round flow, sudden death, win detection, fall-death danger zone |
| `lobby.test.ts` (14) | Lobby gating, team select caps, ready / host countdown (3s/10s), countdown→playing, host reassign, leave-to-spectate, ended→lobby, input / weapon guards, 2v2 spawn spread |
| `prediction.test.ts` (3) | Client prediction / reconciliation against authoritative state |
| `gamepad.test.ts` (4) | Gamepad → `PlayerInput` mapping |

## 3. Headless bot match

```bash
npm run match:sim   # tsx scripts/matchSim.ts
```

Runs the authoritative `GameSim` with two bots — **no networking, no
rendering** — possible only because the simulation is networking-free. It plays
**3 consecutive matches** and asserts:

- the match runs to completion and a result is decided (a winner, or a draw on
  simultaneous death);
- no crash, no unhandled rejection;
- no `NaN` / `Infinity` in any position, velocity, or health value;
- terrain destruction events are applied consistently (the solid cell count
  actually drops as craters land);
- server tick duration stays under budget (avg < 5 ms, max < 33 ms) — no death
  spiral.

Sudden death guarantees each match ends well before the
`MAX_SIM_SECONDS_PER_MATCH` (240 s) safety cap. Exits non-zero on any failure.

## 4. Screenshots

```bash
npm run screenshot  # tsx scripts/screenshot.ts
```

Launches server + client headlessly with **Playwright** (Chromium) and walks the
full flow with two pages: a solo `?autostart` match (in-game frames at t=2/6/10 s
plus a solo-pause freeze check), then a host+joiner lobby that captures the **room
browser**, the **lobby** (teams / ready / host), the host **countdown**, a live
**2v2 match**, and **leave-to-spectate**. The 3D frames must show a rendered
battlefield — never a blank or black canvas.

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
