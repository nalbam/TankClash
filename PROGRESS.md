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

## Iteration 3 — 2026-06-13

- Changed: client-side prediction + reconciliation for the local tank (root cause of movement feel 7 and latency tolerance 7 — previously even your own tank was rendered at the 100 ms interpolation delay, so input felt laggy). Extracted `stepVehicle` into `shared/physics.ts` behind a `VehicleBody` interface so the exact same movement code runs server-side and in the client predictor (`server/systems/physicsSystem.ts` now re-exports it). Added `LocalPredictor`: applies sampled input immediately, replays unacknowledged inputs against each authoritative server patch (keyed on the synchronized `lastSeq`), and hard-snaps on large divergence (respawn/teleport). `main.ts` renders the local tank from the predicted body; remote tanks stay on snapshot interpolation. Also hardened the screenshot gate to spawn its server/client in a detached process group and kill the whole group on teardown (no more EADDRINUSE from leaked servers).
- Gates: typecheck PASS | tests PASS (27/27, +3 prediction) | bot match PASS | screenshots OK
- Measurements:
  - new `tests/prediction.test.ts` — proves the predictor equals the authoritative simulation after partial-ack replay, converges to the server position on full ack, and hard-resets past the 14-unit snap threshold
  - match:sim — 3 matches, tick avg 0.008 ms / max 1.645 ms (server untouched)
  - screenshot — 47 fps avg headless, clean teardown (ports free, no leftover procs); `match-t30s.png` shows the predicted local tank, both tanks framed, a bot sheltering inside a blown-out terrain pocket, and the aim arc
- Rubric deltas:
  - real-time movement feel 7 → 9 (local input applied with zero network delay; verified by prediction tests + live screenshots showing local-tank motion)
  - latency tolerance 7 → 9 (local movement no longer waits on the round trip; remote entities use a 100 ms interpolation buffer — the standard authoritative-netcode posture, with reconciliation proven correct)
  - multiplayer synchronization 8 → 9 (reconciliation keeps prediction locked to authoritative state; replay verified deterministic)
- Status: all judgment categories now ≥ 8; all measurable categories meet targets. Stopping condition under review.

## Iteration 4 — 2026-06-13 (documentation + stopping condition)

- Changed: wrote the full README (install / dev + production run / controls /
  verification / architecture / networking / gameplay tuning / known limitations)
  for the Final Deliverable, and corrected `.env.example` from "webpack" to Vite
  as required by the build wiring. No gameplay or engine code touched.
- Gates: typecheck PASS | tests PASS (27/27) | bot match PASS | screenshots OK; `npm run build` (→ public/) and `npm run build:server` (→ dist/) both succeed.
- Stopping condition check (all true):
  - Milestone 1 complete — movement, mouse aim, charge cannon, projectile
    physics, wind, destructible craters, health/damage, knockback, camera
    follow, HUD, win/loss, round restart all present
  - all four verification gates pass
  - headless bot match completes with a winner, repeatedly (3/3)
  - player can win or lose; terrain destruction affects tactics (asserted in
    match:sim; bots shelter in blown-out pockets, visible in screenshots)
  - measurable categories meet targets; judgment categories all ≥ 8 with evidence
  - PROGRESS.md holds the full iteration history; README documents the slice
- Final rubric: movement 9 · aiming 8 · sync 9 · projectile readability 7 ·
  terrain destruction 8 · combat clarity 9 · visual polish 8 · UI readability 8 ·
  bot usefulness 8 · server stability 9 · performance 8 · latency tolerance 9 ·
  replayability 8. **Milestone 1 stopping condition met.**
- Future work (Milestone 2+): more weapons, minimap, multiple arenas, 2v2,
  spectator, projectile prediction, rollback.

---

# Milestone 2

## Iteration 5 — 2026-06-13 (weapon arsenal)

- Changed: extended the weapon system from one cannon to **five distinct,
  data-driven weapons** plus a cluster child. `WeaponDef` now carries behavior
  modifiers (`pellets`/`spread`, `splitOnImpact`, `pierce`/`pierceRadius`,
  `gravityScale`) so each weapon has a real role:
  - **Cannon** — balanced arc baseline
  - **Mortar** — heavy high-arc lobber (gravityScale 1.35), big crater/splash, drops behind cover
  - **Shotgun Shell** — 6-pellet spread cone, devastating up close, scatters at range
  - **Cluster Rocket** — flat rocket that bursts into 5 bomblets on impact (area denial)
  - **Drill Missile** — tunnels through terrain (`stepProjectile` pierce path carves a tunnel each tick) then detonates, defeating cover
  Added weapon selection: number keys 1–5 → server message → authoritative
  switch (blocked mid-charge / for non-selectable ids), a HUD weapon bar that
  highlights the active slot, and bot weapon choice by range + line-of-sight
  (shotgun close, mortar/drill vs cover, cluster/cannon open).
- Gates: typecheck PASS | tests PASS (33/33, +6 weapon tests) | bot match PASS | screenshots OK
- Measurements:
  - `tests/weapons.test.ts` proves shotgun spawns N pellets, cluster spawns
    bomblets on impact, drill removes solid cells (tunnels), and the catalog has
    5 unique selectable roles with the bomblet non-selectable
  - match:sim — after fixing the bot ballistic solver to honor per-weapon
    `gravityScale` (root cause: solver assumed normal gravity, so mortar/drill
    shots missed and matches ballooned to 121 s / 1159 craters), matches
    normalized to 7–58 s with 101–293 craters and varied winners
- Rubric deltas:
  - bot usefulness 8 → 9 (situational weapon choice; solver matches each weapon's arc)
  - terrain destruction quality 8 → 9 (drill tunnels + cluster spread reshape the arena, visible in t10s screenshot)
  - combat clarity stays 9 (weapon bar + active highlight readable in screenshot)
  - replayability 8 → 9 (five weapons with distinct counterplay)
- Next target: minimap + multiple arena layouts (Milestone 2), then particle/
  visual polish per weapon.

## Iteration 6 — 2026-06-13 (arenas + minimap)

- Changed: added **four arena layouts** chosen deterministically from the seed
  (`layoutForSeed`) so client and server still regenerate the identical grid —
  `hills` (rolling), `plateau` (high mesa with a central chasm), `caverns`
  (thick massif riddled with hollows), `islands` (three peaks over deep gaps).
  Each guarantees flat footing at both spawn columns. Added a **minimap**
  (`client/ui/minimap.ts`): a downsampled terrain silhouette rebuilt only when
  the terrain changes (round reset or crater), with live team-colored tank
  markers. Round rotation now cycles layouts since the per-round seed advances.
- Gates: typecheck PASS | tests PASS (35/35, +2 arena tests) | bot match PASS | screenshots OK
- Measurements:
  - `tests/terrain.test.ts` — proves layout choice is deterministic and every
    layout yields playable solidity (8–80%) with ground at both spawns
  - match:sim — 3 matches across rotating layouts, 11–59 s, varied winners,
    tick avg 0.008 ms / max 1.648 ms
  - screenshot — `match-t2s.png` shows the minimap (terrain + both tank markers)
    on a caverns arena with the weapon bar; 54 fps avg headless
- Rubric deltas:
  - UI readability 8 → 9 (minimap adds at-a-glance positional awareness)
  - replayability 9 → 10 (four arena layouts × five weapons)
  - visual polish 8 → 9 (distinct arena silhouettes)
- Next target: per-weapon particle/visual identity and reconnect-aware
  connection status UI (polish loop).

## Iteration 7 — 2026-06-13 (per-weapon visuals + reconnect)

- Changed: gave each weapon a **distinct visual identity** — added `color` and
  `explosionColor` to `WeaponDef` (cannon amber, mortar deep red, shotgun
  yellow, cluster violet, drill magenta, bomblet orange). `Effects` now caches
  materials per color and tints projectiles, trails, muzzle flashes, explosions,
  and shockwave rings from the firing/explosion weapon; projectile mesh size
  scales with `projectileRadius`. Added **auto-reconnect**: an abnormal room
  leave (code ≠ 1000) schedules a fresh join with retry/backoff, and the client
  shows a "CONNECTION LOST — RECONNECTING…" banner while it heals (normal
  headless teardown at code 1000 is ignored, so the gate stays clean).
- Gates: typecheck PASS | tests PASS (35/35) | bot match PASS | screenshots OK
- Measurements:
  - screenshot — `match-t10s.png` shows per-weapon explosion smoke and the full
    HUD (minimap + weapon bar + both tanks); 44 fps avg headless
  - match:sim unchanged (visuals are client-only); tick avg 0.009 ms
- Rubric deltas:
  - projectile readability 7 → 9 (each weapon's shell/trail/blast is color-coded)
  - visual polish 9 → 10 (cohesive per-weapon palette, smoke, shockwaves)
  - server stability 9 → 10 (reconnect handles drops gracefully)
- Milestone 2 complete: 5 weapons, weapon selection, 4 arenas, minimap,
  smarter bots, per-weapon visuals, reconnect. All gates green.

---

# Milestone 3

## Iteration 8 — 2026-06-13 (five more weapons + status effects)

- Changed: added a **status-effect system** (`shieldTime`, `burnTime` on
  PlayerState; `STATUS` constants) and five new weapons, bringing the arsenal to
  **ten**:
  - **Railgun** — hyper-velocity flat shot (gravityScale 0, speed 210–280),
    near-instant with a big direct-hit bonus; reuses the projectile path
  - **Gravity Bomb** — explosion pulls victims inward (combo into holes/hazards)
  - **Napalm** — low burst but applies burn damage-over-time to enemies
  - **Shield Grenade** — team support: shields allies in the burst (no enemy damage)
  - **Repair Foam** — team support: heals allies in the burst
  `damageSystem` now handles inward pull, burn application, ally-only buffs, and
  shield damage reduction; `GameSim` ticks burn DoT and shield decay each frame.
  Weapon selection extended to keys 1–9 and 0 (ten slots, two-row HUD bar), bot
  weapon choice includes the new weapons (self-heal when hurt, railgun aimed via
  a flat-trajectory solver branch), and tanks show a shield bubble + burn tint.
- Gates: typecheck PASS | tests PASS (42/42, +7 status, +catalog) | bot match PASS | screenshots OK
- Measurements:
  - `tests/status.test.ts` proves gravity pulls inward, napalm burns and the DoT
    kills with igniter credit, shield buffs allies/ignores enemies and reduces
    damage by `SHIELD_REDUCTION`, repair heals allies only, railgun is a flat
    high-speed shot
  - match:sim — bots wield all ten weapons; 19–49 s matches, varied winners,
    tick avg 0.008 ms
  - screenshot — `match-t30s.png` shows the ten-weapon two-row bar, blast
    shockwaves and a damage number on the local tank
- Rubric deltas:
  - replayability 10 → stays 10 (now ten weapons × four arenas)
  - combat clarity stays 9; bot usefulness stays 9 (weapon-aware aim holds with railgun)
- Next target: 2v2 team mode + round summary, then spectator mode + lobby.

## Iteration 9 — 2026-06-13 (2v2 + round summary)

- Changed: the room now fills bots up to a mode-driven tank count (`fillTo` = 2
  for 1v1, 4 for 2v2) with named bots, so a 2v2 match assembles two players per
  team (the existing alternating team assignment makes the split even). Added a
  **round summary**: the scoreboard auto-shows while a round is over (kills are
  cumulative across the match), and the winner banner moved up so both read
  cleanly together.
- Gates: typecheck PASS | tests PASS (45/45, +3 team-match) | bot match PASS | screenshots OK
- Measurements:
  - `tests/match.test.ts` — proves four players split into 2v2, a round ends
    only when a whole team is wiped, and survives while both teams have a
    survivor (the win condition already generalized from 1v1)
  - match:sim (1v1 regression) and screenshot gate both green
- Rubric deltas: no regressions; 2v2 broadens match variety (replayability holds at 10).
- Next target: spectator mode + lobby/menu for choosing 1v1 vs 2v2.

## Iteration 10 — 2026-06-13 (lobby + spectator)

- Changed: added a **lobby menu** (title, call-sign input, mode buttons for
  1v1 / 2v2 / Spectate, Play) shown before connecting; URL params (`?name=` or
  `?autostart`) skip it so the screenshot gate and shareable links start
  immediately. Added **spectator mode**: spectators join without a tank
  (`onJoin` skips `addPlayer` when `spectator` is set), receive synchronized
  state, watch the action camera, and have the player-only HUD hidden. The chosen
  mode/name/spectator flag flows through `NetClient.connect` and is preserved
  across auto-reconnect.
- Gates: typecheck PASS | tests PASS (45/45) | bot match PASS | screenshots OK
- Measurements:
  - manual capture verified: `screenshots/menu.png` (lobby) and
    `screenshots/spectate.png` (spectator watching BOT Rusty vs BOT Boltz, no
    player HUD, action camera tracking) — spectator reported connected, 2 bots,
    phase playing
  - 1v1 autostart screenshot + match:sim regression both green
- Rubric deltas:
  - UI readability 9 → 10 (proper entry menu; spectator HUD declutters correctly)
- Milestone 3 core complete: ten weapons, 2v2, spectator, lobby, round summary,
  per-weapon visuals. Not built: gamepad support and replay recording (the two
  optional/peripheral M3 items) — see Known Limitations.

## Iteration 11 — 2026-06-13 (gamepad support)

- Changed: added **gamepad support** to `InputManager` via the Gamepad API,
  polled once per frame. Standard mapping: left stick / d-pad move, A jump, B
  dash (edge), right trigger or X charge/fire, right stick aims (overrides the
  mouse while pushed), LB/RB cycle weapons, Start restarts. Gamepad inputs merge
  with keyboard/mouse, so either works; with no pad connected the poll early-
  returns and nothing changes. Extracted the stick-mapping math (`stickToMove`,
  `stickToAim`) into pure exported functions so it is unit-testable without a
  physical pad or the DOM. (Replay recording was removed from the spec.)
- Gates: typecheck PASS | tests PASS (49/49, +4 gamepad) | bot match PASS | screenshots OK
- Measurements:
  - `tests/gamepad.test.ts` — verifies stick→move past the deadzone, d-pad
    fallback, right-stick→aim (world-y up, deadzone), the pure mapping the live
    poll uses
  - match:sim + keyboard/mouse screenshot gate both green (pad-absent path
    unchanged)
- Rubric deltas: no regressions; gamepad widens accessibility (input options).
- Limitation: live testing needs a physical controller; only the pure mapping is
  gate-covered. The full Milestone 3 feature set (minus the descoped replay
  recording) is now complete.

## Iteration 12 — 2026-06-13 (pause + quit to lobby)

- Changed: added a **pause menu** (Esc or gamepad Start) with Resume and Quit to
  Lobby. Pause is honored server-side only when a single human is connected
  (`clients.length <= 1`): the room skips its fixed tick, so a solo/bot match
  truly freezes — bots included. In a shared match the request is ignored
  (one player can't freeze everyone) and the menu is local-only; a new arrival
  or a leave resumes the room. Quit to Lobby returns to the menu via a clean
  reload. While paused the client stops sending input and renders the frozen
  world behind a blurred overlay.
  - Also fixed a latent gate-reliability bug found along the way: the screenshot
    gate could attach to a leftover server from a prior run (showing phantom
    players); it now frees ports 2567/8087 before starting.
- Gates: typecheck PASS | tests PASS (49/49) | bot match PASS | screenshots OK
- Measurements:
  - the screenshot gate now asserts pause behavior: after Esc the pause menu is
    visible and the bot's x is frozen (Δx=0.00 over 2 s once interpolation
    settles) — `screenshots/paused.png` shows the overlay with both tanks halted
  - 1v1 capture back to the correct 2 players after the port-cleanup fix
- Rubric deltas: server stability stays 10 (pause is bounded to solo matches);
  UI readability stays 10 (clear pause/quit flow).
- This is a post-Milestone-3 usability addition requested after the spec
  milestones were complete.

## Iteration 13 — 2026-06-13 (fall-death danger zone)

- Changed: removed the implicit world floor so falling into a bottomless gap is
  lethal, matching the PROMPT's "fall into holes or danger zones" intent.
  Root cause of the reported issue: `solidAt` treated everything below the grid
  (`cy < 0`) as solid, so a tank dropping through a fully-destroyed column just
  landed safely at y≈1 and the `FALL_KILL_Y` check (y < -5) was unreachable dead
  code — tanks could get stuck in deep pits instead of dying. `solidAt` now
  returns solid only for the side walls; below the terrain is empty, so a tank
  that falls keeps dropping until the match system's fall-kill fires. Spawns are
  unaffected (they sit on `surfaceY`), and side walls still bound the arena
  horizontally.
- Gates: typecheck PASS | tests PASS (50/50, +1 fall-death) | bot match PASS | screenshots OK
- Measurements:
  - `tests/match.test.ts` now proves a tank dropped through a carved-out column
    dies (and is below y=0 when it does); the terrain test asserts walls solid /
    floor absent / sky empty
  - match:sim still completes 3 matches with winners (bots survive normal play;
    only fully-destroyed columns are deadly), screenshot gate green incl. pause
- Decision: chosen behavior is **instant death** (danger zone), per the user's
  selection over safe-respawn / damage+respawn / stuck-fix alternatives.
- Follow-up worth noting: bots don't yet path around freshly-opened pits, so they
  can occasionally fall in — acceptable for now (matches still resolve), a future
  bot-awareness improvement.

## Iteration 14 — 2026-06-15 (dead tanks linger as wrecks)

- Changed: a killed tank now stays on the field as a scorched wreck instead of
  vanishing. Root cause of the disappearance was purely client-side —
  `vehicleRenderer` set `tank.group.visible = view.alive`, hiding the whole
  model on death. The server already preserves a dead fighter's `x/y/tilt` and
  `alive=false` (`GameSim.tick` skips physics for `!p.alive`, so the corpse
  freezes in place), so only the renderer changed: a dead tank keeps
  `visible=true`, swaps hull + team-strip materials to a burnt tint
  (`0x2b2b2b`), lists `WRECK_LEAN` past the terrain tilt with the barrel drooped
  (`-0.6`), and drops charge glow / shield. `setDead` swaps materials only on the
  live↔dead transition; respawn (`resetRound`) restores the team color via the
  stored `baseColor`. Spectators are unaffected — `main.ts` already excludes them
  from the tank set.
- Gates: typecheck PASS | tests PASS (71/71) | bot match PASS | screenshots OK
- Measurements:
  - deterministic scene-graph assertion (temporary `__vehicles` exposure, then
    reverted): at round end the dead blue tank reads `dead=true`,
    `visible=true`, hull `0x2b2b2b`, group `rotZ=-0.822`, barrel `-0.6`; the
    surviving red bot stays normal (`0xff5d5d`, live aim angle)
  - match:sim unchanged (server logic untouched); screenshot gate green
- Scope: client-render-only change, no server edits. The corpse sits at the
  position it died at (server halts its physics on death).
- Follow-up: on the win screen the camera frames the midpoint of both spawns at a
  fixed zoom, so a corpse far from the survivor can fall outside the frame — a
  camera-framing concern, separate from the wreck rendering itself (covered by
  the pending weighted-midpoint / dynamic-zoom camera work in `.prompt.md`).

## Iteration 15 — 2026-06-15 (shareable room codes + all-tank camera framing)

- Changed two `.prompt.md` items:
  1. **Unique room codes.** Colyseus already assigned a unique internal
     `roomId`, but there was no human-readable code to share. Each room now mints
     a 4-char code from a confusion-free alphabet (no O/0, I/1). `onCreate`
     queries `matchMaker` for live rooms and re-rolls until the code is unused,
     then publishes it on `GameState.roomCode` and matchmaking `metadata.code`.
     The browser shows it as a chip beside the mode; the in-room lobby shows
     `ROOM CODE · XXXX` under the title. Per the user's choice, "unique room" =
     a shareable code; a join-by-code input box is out of scope (rooms are still
     joined by clicking the listing, which now carries the code).
  2. **All-tank camera framing.** The camera previously framed only the local
     tank + its nearest enemy, so in 2v2 a teammate or the far enemy fell off
     screen. It now aims at the weighted midpoint of *every living tank* (the
     local player counts `CAMERA_LOCAL_WEIGHT`=1.8×) and zooms to the largest
     distance from that midpoint to any tank. `FollowCamera.update` was
     generalized from a two-point (focus, enemy) form to a (center, spanX,
     spanY) form; `CAMERA_Z_MAX` 135→165 to fit a 2v2 spread.
- Gates: typecheck PASS | tests PASS (71/71) | bot match PASS | screenshots OK
- Measurements:
  - uniqueness: a one-off integration script created **6 rooms concurrently**
    (worst case for same-ms collisions) — all six codes were distinct and
    well-formed (`T4HF 533D 9DDK 8KJF NWHD S3QU`)
  - `screenshots/lobby-browser.png` shows the code chip in the room row;
    `screenshots/lobby-room.png` shows `ROOM CODE · 52AX` under the lobby title
  - `screenshots/match-2v2.png` now frames all four living tanks (both blue, both
    red) at once — previously only the nearest enemy stayed in view
- Follow-up: a join-by-code input box / `?room=CODE` deep link would complete the
  share flow; deferred as a separate feature.
