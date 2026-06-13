# TankClash — Iteration Log

Verification gates: `npm run typecheck` · `npm test` · `npm run match:sim` · `npm run screenshot`

## Iteration 1 — 2026-06-13

- Changed: full Milestone 1 vertical slice from empty repo — shared deterministic terrain grid + physics constants, authoritative `GameSim` (vehicle physics, charge-fire cannon, splash/knockback damage, wind drift, round flow with sudden death), Colyseus 0.16 room + server with `/api/rooms` health check, server-side bot (ballistic solver, dodging, imperfect aim), Three.js client (chunked destructible terrain mesh, tank models, particle effects, shockwaves, camera follow + shake, DOM HUD with health/wind/timer/killfeed/scoreboard/damage numbers), 100 ms snapshot interpolation, and the 4-gate verification harness itself.
- Gates: typecheck PASS | tests PASS (24/24) | bot match PASS | screenshots OK
- Measurements:
  - match:sim — 3 consecutive matches completed (winners blue/blue/red, durations 56 s/22 s/36 s, craters 55/22/36, 116 shots, 3 kills), tick avg 0.007 ms / max 1.211 ms (budget 5/33 ms)
  - screenshot — 52 fps average in headless SwiftShader (software GL; real GPUs render far faster), ping 20–22 ms local, players 2, phase reached `playing` and `ended`
  - terrain destruction verifiably changed solid cell count and craters are visible in `screenshots/match-t30s.png`
- Rubric deltas (initial scoring, evidence in parentheses):
  - movement feel 7 (responsive in sim; own tank rendered with 100 ms interpolation delay, no client prediction yet)
  - aiming and firing feel 6 (no trajectory preview; enemy can be off-screen while aiming)
  - multiplayer synchronization 8 (server-authoritative, snapshot interpolation, no desync observed)
  - projectile readability 7 (glowing shell + additive trail)
  - terrain destruction quality 8 (craters/tunnels form and reroute bots — match:sim asserts solid count drops)
  - combat clarity 6 (camera follows local tank only; opponent frequently off-screen)
  - visual polish 7 · UI readability 8 · bot usefulness 8 (bots fight, dodge, win rounds)
  - server stability 9 (3 matches, zero crashes/NaN) · performance 8 · latency tolerance 7 (not yet tested with artificial delay)
- Next target: combat clarity + aiming feel — frame both tanks in the camera and add a wind-aware trajectory preview arc.

## Iteration 2 — 2026-06-13

- Changed: lowest-scoring categories from loop 1 (combat clarity 6, aiming feel 6). Camera now frames the local tank together with the nearest enemy — it aims at a weighted midpoint and dynamically zooms out (z 70→135) so both stay on screen. Added a wind-aware trajectory preview (`client/render/trajectory.ts`): a GPU-point arc simulated client-side with the exact server cannon constants (gravity, wind influence, muzzle offset), stopping at the terrain hit, shown while aiming/charging.
- Gates: typecheck PASS | tests PASS (24/24) | bot match PASS | screenshots OK
- Measurements:
  - match:sim unchanged — 3 matches, tick avg 0.007 ms / max 1.122 ms (server logic untouched)
  - screenshot — 54 fps avg headless; `screenshots/match-t10s.png` now shows BOTH tanks framed, the teal aim arc, and a shell mid-flight with trail
- Rubric deltas:
  - combat clarity 6 → 9 (both tanks always framed; verified in t10s screenshot)
  - aiming and firing feel 6 → 8 (wind-aware preview arc gives the shot a readable destination)
  - visual polish 7 → 8 (dynamic framing + arc read as intentional presentation)
- Next target: latency tolerance (7) — still untested under artificial delay; add a delayed-input path or measure interpolation smoothness at +100 ms.
