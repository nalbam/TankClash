# Build: TankClash — Real-Time Multiplayer Fortress Reboot, Self-Evaluating Loop

You are building **TankClash**, a modern real-time multiplayer artillery combat game inspired by Fortress, Scorched Earth, Gunbound, Worms, Noita, and modern physics-based arena games.

This is not turn-based.

TankClash is a real-time tactical artillery action game where players control armored vehicles on destructible terrain, aim continuously, fire physics-based weapons, dodge incoming shots, and reshape the battlefield during combat.

The entire goal is to create a polished 2026-style multiplayer vertical slice.

---

## Technology Stack

Use the following stack:

* **Client**: Three.js as the game engine/rendering layer
* **Server**: Colyseus with Node.js
* **Real-time Sync**: WebSocket-based state synchronization
* **Language**: TypeScript
* **Build Tool**: Vite

The project must be structured as a real multiplayer game from the start.

Do not build a fake local-only prototype that cannot evolve into online multiplayer.

---

## Core Game Identity

TankClash should feel like:

> Fortress + real-time arena combat + destructible terrain + modern 3D presentation + competitive multiplayer.

The game should be:

* fast but readable
* tactical but not slow
* skill-based
* physics-driven
* visually satisfying
* multiplayer-first
* easy to understand from a screenshot

Avoid random sandbox chaos.

Every system must support readable competitive gameplay.

---

## Camera and Presentation

Use a 2.5D side-view battlefield rendered with Three.js.

The game world may be 3D, but gameplay should remain mostly side-on.

Recommended style:

* 3D vehicles
* 3D terrain chunks or deformable terrain mesh
* side-view camera
* parallax background
* cinematic camera shake
* projectile trails
* volumetric-looking smoke using particles
* glowing weapon effects

Do not use full free-camera 3D gameplay unless it clearly improves the game.

---

## Multiplayer Architecture

Use Colyseus rooms.

The server is authoritative for:

* match state
* player positions
* player health
* projectile spawning
* damage resolution
* terrain destruction events
* weapon cooldowns
* round state
* win/loss state

The client handles:

* rendering
* input collection
* prediction where appropriate
* interpolation
* visual effects
* UI
* audio
* camera

Use WebSocket state synchronization through Colyseus.

Design for:

* 1v1
* 2v2
* free-for-all
* spectators
* replay recording later

---

## Required Code Structure

Split the project into clear modules.

Client:

* `client/main.ts`
* `client/render/scene.ts`
* `client/render/camera.ts`
* `client/render/effects.ts`
* `client/render/terrainRenderer.ts`
* `client/render/vehicleRenderer.ts`
* `client/input/input.ts`
* `client/net/colyseusClient.ts`
* `client/ui/hud.ts`
* `client/audio/audio.ts`

Server:

* `server/index.ts`
* `server/rooms/TankClashRoom.ts`
* `server/schema/GameState.ts`
* `server/schema/PlayerState.ts`
* `server/schema/ProjectileState.ts`
* `server/systems/physicsSystem.ts`
* `server/systems/weaponSystem.ts`
* `server/systems/damageSystem.ts`
* `server/systems/terrainSystem.ts`
* `server/systems/windSystem.ts`
* `server/systems/matchSystem.ts`

Shared:

* `shared/types.ts`
* `shared/constants.ts`
* `shared/weapons.ts`
* `shared/math.ts`

Avoid monolithic files.

---

## Core Gameplay

Players control armored vehicles on destructible terrain.

Each player can:

* move left and right
* climb slopes
* jump or boost
* aim freely
* charge shots
* fire weapons
* dodge projectiles
* use terrain as cover
* destroy terrain strategically
* knock enemies from position
* fall into holes or danger zones

The match continues in real time until one player or team wins.

---

## Controls

Implement:

* A / D: move
* Space: jump or boost
* Shift: dash
* Mouse: aim
* Left mouse: hold to charge, release to fire
* Right mouse: alternate fire or utility
* 1–5: weapon select
* R: reload or vent heat
* Tab: scoreboard

Movement must feel responsive, but vehicles should still feel heavy.

Include:

* acceleration
* friction
* slope handling
* recoil
* knockback
* air control
* landing feedback

---

## Terrain System

Terrain is the heart of TankClash.

Implement destructible terrain that supports:

* procedural arena generation
* projectile collision
* player collision
* circular crater destruction
* line-of-sight blocking
* cover creation
* tunnels
* cliffs
* slopes
* material variation

Terrain destruction must be synchronized from the server.

Clients should render terrain changes smoothly.

The terrain system must affect:

* movement
* projectiles
* tactics
* visibility
* cover
* match flow

---

## Weapons

Start with one weapon.

Do not add more until the basic cannon feels excellent.

### Milestone 1 Weapon

#### Cannon

* charge-based projectile
* gravity arc
* terrain crater
* splash damage
* direct-hit bonus
* knockback
* clear trail
* satisfying explosion

### Milestone 2 Weapons

Add:

* Mortar
* Shotgun Shell
* Cluster Rocket
* Drill Missile

### Milestone 3 Weapons

Add:

* Railgun
* Gravity Bomb
* Napalm
* Shield Grenade
* Repair Foam

Every weapon must have:

* clear gameplay role
* readable visual identity
* cooldown or ammo cost
* terrain interaction
* counterplay
* strong feedback

No weapon should be pure spam.

---

## Real-Time Physics

Projectile physics must include:

* gravity
* velocity
* wind influence
* terrain collision
* vehicle collision
* splash radius
* damage falloff
* knockback
* self-damage

Physics should be server-authoritative.

The client may predict locally for responsiveness, but the server result is final.

Prioritize deterministic, debuggable simulation.

---

## Wind System

Wind is a key identity feature.

In TankClash, wind must work in real time.

Wind should:

* change gradually
* affect lightweight projectiles more than heavy ones
* be synchronized by the server
* be visible in UI
* be visible through background particles
* create tactical timing windows

Wind must feel fair, not random.

---

## Visual Direction

TankClash should look like a premium 2026 indie game.

Use a stylized 3D/2.5D look.

Visual references:

* Fortress
* Gunbound
* Worms
* Noita
* Dome Keeper
* Into the Breach
* Teardown-style destruction feel

Visual priorities:

1. readable vehicles
2. satisfying explosions
3. visible terrain damage
4. strong projectile trails
5. dust and smoke
6. shockwaves
7. damage numbers
8. camera shake
9. clear team colors
10. readable UI

Use a cohesive palette.

Example:

* dark navy battlefield sky
* orange explosions
* teal UI accents
* cream terrain highlights
* blue friendly markers
* red enemy markers

Do not make it look like a gray prototype.

---

## UI Requirements

Implement:

* health bar
* armor bar
* selected weapon
* ammo
* cooldown or heat meter
* charge meter
* wind indicator
* minimap
* round timer
* kill feed
* damage numbers
* scoreboard
* connection status
* ping indicator
* winner announcement
* restart prompt

A screenshot should immediately show:

* where the players are
* who is winning
* what weapon is selected
* where the shot will go
* what the wind is doing

---

## Networking Requirements

Use Colyseus for:

* room creation
* player join/leave
* authoritative match state
* synchronized schema state
* player input messages
* projectile events
* terrain destruction events
* round transitions

Implement:

* client-side interpolation
* server tick loop
* fixed timestep simulation
* input sequence numbers
* basic reconciliation if needed
* latency display
* reconnect-safe state handling where practical

Do not over-engineer rollback yet.

Build clean foundations for it.

---

## Bot Support

Bots are required for testing.

Server-side bots should:

* move around terrain
* aim at enemies
* fire cannon
* choose reasonable power
* avoid obvious projectiles
* seek cover when damaged
* occasionally miss

Bots must use the same game rules as human players.

---

## Autonomous Development Loop

Work in repeated improvement loops.

Each loop must:

1. choose the highest-impact missing or weak feature
2. implement it
3. run the client and server
4. create or join a Colyseus room
5. test a playable match
6. capture screenshots or short gameplay recording
7. evaluate against the rubric
8. write findings to `PROGRESS.md`
9. fix the weakest issue
10. commit the result

Do not ask what to do next.

Do not stop after the first working version.

Do not expand scope before the current milestone feels good.

---

## Evaluation Rubric

After every iteration, score from 1 to 10:

* real-time movement feel
* aiming and firing feel
* multiplayer synchronization
* projectile readability
* terrain destruction quality
* combat clarity
* visual polish
* UI readability
* bot usefulness
* server stability
* latency tolerance
* performance
* replayability

Any score below 8 requires another iteration.

Fix the lowest-scoring category first.

Priority order:

1. movement
2. aiming
3. networking correctness
4. terrain destruction
5. combat readability
6. visual feedback
7. UI
8. bots
9. polish

---

## Performance Targets

Target:

* 60 FPS client on a mid-range laptop GPU
* stable server tick rate
* 2–4 active players
* 50+ active projectiles/particles
* synchronized destructible terrain
* no major rubber-banding under normal latency
* playable local server development setup

Optimize rather than deleting visual quality.

---

## Milestone 1

Build the smallest playable multiplayer slice:

* Three.js client
* Colyseus server
* one game room
* two players or one player plus bot
* real-time vehicle movement
* mouse aim
* charge cannon
* projectile physics
* wind
* destructible terrain craters
* health and damage
* knockback
* camera follow
* HUD
* win/loss state
* restart round

Do not add extra weapons yet.

---

## Milestone 2

After Milestone 1 feels good, add:

* 4 weapons
* better terrain visuals
* better particles
* minimap
* better bot behavior
* multiple arena layouts
* improved camera
* procedural audio
* connection status UI

---

## Milestone 3

After Milestone 2 feels good, add:

* 8–10 weapons
* 2v2 mode
* spectator mode
* match lobby
* round summary
* replay recording foundation
* sudden death
* gamepad support
* better menus

---

## Stopping Condition

Stop only when all are true:

* Milestone 1 is complete
* client and server run successfully
* at least one multiplayer or bot match is playable from start to finish
* the player can win or lose
* terrain destruction affects tactics
* cannon combat feels satisfying
* networking is stable enough for local testing
* every rubric category is at least 8/10
* `PROGRESS.md` contains full iteration history
* final commit is created

If these are not true, continue the loop.

---

## Final Deliverable

Produce:

* complete working source code
* install instructions
* server run instructions
* client run instructions
* architecture notes
* networking notes
* gameplay tuning notes
* `PROGRESS.md`
* screenshots
* known limitations

The final result must be a polished real-time multiplayer 2026 Fortress reboot vertical slice called **TankClash**.

Do not stop until the stopping condition fires.
