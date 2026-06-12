# IronClash ⚔️

Real-Time Fortress Reboot 2026

## Technology Stack

- **Client**: Three.js (game engine)
- **Server**: Colyseus (multiplayer framework), Node.js
- **Real-time Sync**: WebSocket-based state synchronization

## Installation

```bash
npm install
```

## Running the Game

### Development Mode

Start both server and client in development mode:

```bash
npm start
```

Or run them separately:

```bash
# Terminal 1 - Start server
npm run start:server

# Terminal 2 - Start client
npm run start:client
```

The server will run on `http://localhost:2567` and the client on `http://localhost:8080`.

### Production Build

```bash
npm run build
```






# Build: Real-Time Fortress Reboot 2026, Self-Evaluating Loop

You are building a modern real-time artillery combat game inspired by Fortress, Scorched Earth, Gunbound, Worms, Noita, and modern physics-based indie games.

This is not turn-based.

The player controls a small combat vehicle on destructible terrain in real time.

Gameplay is compact, but the feel must be excellent.

The entire point of this project is:

> real-time artillery combat that feels fun, readable, tactical, and visually satisfying.

You will work in an autonomous loop:

1. build
2. run
3. capture screenshot or short gameplay recording
4. judge against the rubric
5. identify the weakest part
6. fix it
7. repeat

Do not stop until the stopping condition fires.

---

## Stack and Rules

Use:

* Vite
* TypeScript
* Phaser 3

Optional only if needed:

* Matter.js for advanced rigid-body physics
* PixiJS only if Phaser rendering becomes limiting

No downloaded art packs, models, sprites, or textures.

Everything must be procedural or code-generated:

* procedural terrain
* generated vehicle sprites
* generated projectile effects
* generated particles
* generated UI icons
* generated background layers
* generated material patterns

Keep the project modular.

Split code into:

* `main.ts`
* `gameState.ts`
* `player.ts`
* `terrain.ts`
* `weapons.ts`
* `projectiles.ts`
* `physics.ts`
* `particles.ts`
* `camera.ts`
* `ui.ts`
* `bots.ts`
* `audio.ts`
* `replay.ts`

Target 60fps on a mid-range laptop GPU.

If something hurts performance, optimize it.

Do not simply delete the visual quality.

Keep a `PROGRESS.md` log.

Commit after every iteration.

---

## The Demo Scope

Do not expand this scope until the core loop feels good.

Build a polished local vertical slice with:

* one destructible 2D arena
* 2–4 combat vehicles
* real-time movement
* mouse aiming
* charge-to-fire weapon input
* projectile physics
* explosions
* terrain craters
* health and damage
* knockback
* camera follow
* local multiplayer or player vs bot
* win condition
* restart round flow

This is not a full game yet.

No account system.

No shop.

No metagame.

No campaign.

No online multiplayer until the local game is fun.

---

## Core Gameplay

Players fight on a side-view destructible landscape.

Unlike classic Fortress, everyone acts simultaneously.

Each player can:

* move left and right
* climb or slide on slopes
* jump or short boost
* aim freely
* charge shots
* fire weapons
* dodge incoming projectiles
* use terrain as cover
* destroy terrain tactically
* fall into holes
* knock enemies out of position

The game should feel like:

> Fortress + real-time arena action + destructible terrain + readable chaos.

---

## Controls

Implement tight, responsive controls.

Keyboard and mouse:

* A / D: move
* Space: jump or boost
* Shift: dash
* Mouse: aim
* Left mouse: hold to charge, release to fire
* Right mouse: alternate fire or utility
* 1–5: weapon select
* R: reload or vent heat
* Tab: scoreboard

Gamepad support is a stretch goal.

Movement must include:

* acceleration
* friction
* slope handling
* air control
* recoil
* knockback
* landing impact feedback

The vehicle must feel heavy enough to belong in Fortress, but responsive enough for real-time combat.

---

## Terrain System

Terrain is the heart of the game.

Implement fully destructible 2D terrain.

Terrain must support:

* procedural generation
* collision against players
* collision against projectiles
* circular crater destruction
* line-of-sight blocking
* tunnels
* slopes
* overhangs if feasible
* terrain dust and debris
* multiple terrain materials

Terrain destruction must immediately affect:

* movement
* projectile paths
* cover
* visibility
* tactical choices

Avoid huge flat surfaces.

The arena should have:

* hills
* valleys
* ledges
* cover pockets
* risky exposed ridges
* lower danger zones

---

## Real-Time Projectile Physics

Projectile simulation must include:

* gravity
* velocity
* wind influence
* collision with terrain
* collision with vehicles
* splash damage
* direct-hit bonus
* knockback
* self-damage
* projectile trails

The simulation should be predictable.

Real-time chaos is allowed.

Random unfairness is not.

Show aiming assistance:

* aim direction line
* short predicted arc
* charge power indicator
* weapon-specific targeting feedback

---

## Wind System

Wind is a signature Fortress element.

But because this game is real-time, wind must be readable and fair.

Wind should:

* change gradually
* affect lightweight projectiles more than heavy ones
* be visible in the UI
* be visible in background particles
* create timing opportunities
* never feel randomly punitive

Add a wind meter with:

* direction
* strength
* trend

---

## Weapon Set

Start with one weapon.

Do not add more until the basic cannon feels excellent.

### Milestone 1 Weapon

#### Cannon

* medium-speed projectile
* charge-based power
* small explosion
* terrain crater
* splash damage
* direct-hit bonus
* clear projectile trail

### Milestone 2 Weapons

Add:

#### Mortar

* high arc
* strong terrain damage
* slow reload

#### Shotgun Shell

* short-range spread
* great for close fights
* weak terrain damage

#### Cluster Rocket

* projectile splits into bomblets
* strong area denial

#### Drill Missile

* travels through terrain
* explodes after delay

### Milestone 3 Weapons

Add:

#### Railgun

* charge delay
* instant line shot
* pierces thin terrain
* clear warning beam

#### Gravity Bomb

* pulls vehicles and projectiles
* explodes after a short delay

#### Napalm

* creates burning area
* denies terrain zones

#### Shield Grenade

* creates temporary protective dome

#### Repair Foam

* creates temporary cover or repairs terrain

Every weapon must have:

* clear role
* readable visual identity
* cooldown or ammo tradeoff
* counterplay
* terrain interaction
* satisfying feedback

No weapon may become pure spam.

---

## Combat Rules

Implement:

* health
* armor
* damage falloff
* knockback
* reload timing
* heat or cooldown
* ammo limits
* weapon switching delay
* out-of-bounds damage
* sudden death pressure after a time limit

Combat should reward:

* aim skill
* movement
* timing
* terrain knowledge
* weapon choice
* wind reading

Combat should punish:

* standing still
* firing without line-of-sight awareness
* ignoring wind
* careless self-damage
* hiding forever

---

## Bots

Implement bots early so the game is testable.

Bots should:

* move around terrain
* aim at the player
* select weapon by distance
* avoid obvious incoming projectiles
* seek cover when damaged
* reposition when line of sight is blocked
* occasionally miss naturally

Bots do not need to be brilliant.

They must create pressure and make testing fun.

---

## Visual Direction

Target a 2026 premium indie look.

The style should be:

* stylized
* clean
* punchy
* colorful
* readable
* slightly chunky
* physically satisfying

Inspiration:

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
3. visible terrain craters
4. projectile trails
5. shockwaves
6. smoke and dust
7. damage numbers
8. screen shake
9. clear silhouettes
10. readable UI

Do not make the game look like a gray prototype.

Use a cohesive palette.

Example palette:

* dark navy sky
* warm orange explosions
* teal UI accents
* cream terrain highlights
* red enemy indicators
* blue friendly indicators

---

## Background and Arena Atmosphere

The battlefield should feel alive.

Add:

* layered parallax sky
* distant mountains or city silhouettes
* drifting smoke
* clouds
* wind particles
* subtle lighting changes
* animated debris
* impact flashes

The background must not reduce gameplay readability.

---

## UI Requirements

The UI must be readable during chaos.

Include:

* player health
* armor
* weapon name
* ammo
* cooldown or heat
* charge meter
* wind indicator
* minimap
* round timer
* kill feed
* damage numbers
* winner announcement
* restart prompt
* debug overlay toggle

A screenshot should immediately communicate:

* who is winning
* where the players are
* what weapon is selected
* where the shot is going
* how strong the wind is

---

## Camera Requirements

Camera must support:

* smooth player follow
* zoom based on action
* shake on explosions
* projectile emphasis
* arena overview at round start
* win moment framing

The camera must never lose the player during combat.

If multiple local players exist, use either:

* dynamic zoom to include active combatants
* split-screen fallback
* camera focus on the human player with minimap support

---

## Audio

Use procedural or generated placeholder audio.

No downloaded audio packs.

Add:

* cannon shot
* explosion
* charge sound
* reload sound
* hit sound
* vehicle movement loop
* low health warning
* UI select sounds

Audio must support game feel.

Do not leave the game silent.

---

## Replay and Debugging

Implement a simple replay/debug layer.

At minimum:

* record player inputs
* record projectile spawns
* record explosions
* allow quick round restart
* show debug collision masks
* show projectile trajectory debug
* show FPS

Replay does not need to be production-ready.

It exists to help evaluation.

---

## Code Architecture

Use data-driven systems.

Separate:

* rendering
* physics
* input
* weapons
* terrain mutation
* damage
* bot decisions
* UI
* audio
* replay logging

Avoid monolithic scene code.

Use clear TypeScript interfaces for:

* Player
* Weapon
* Projectile
* TerrainMaterial
* Explosion
* DamageEvent
* BotDecision
* ReplayEvent

---

## Autonomous Development Loop

You must work in iterations.

Each iteration must do the following:

1. choose the highest-impact missing or weak feature
2. implement it
3. run the game
4. capture screenshot or gameplay recording
5. evaluate honestly
6. write findings to `PROGRESS.md`
7. fix the weakest visible or playable issue
8. commit the result

Do not ask what to do next.

Do not stop after a single feature.

Do not expand scope before the current milestone feels good.

---

## Evaluation Rubric

After every iteration, score each category from 1 to 10:

* Real-time movement feel
* Aiming and firing feel
* Projectile readability
* Terrain destruction quality
* Weapon satisfaction
* Combat clarity
* Bot usefulness
* Camera quality
* UI readability
* Visual polish
* Audio feedback
* Performance
* Replayability

Any score below 8 requires further work.

Prioritize the lowest score.

If multiple scores are low, fix in this order:

1. movement
2. aiming
3. terrain destruction
4. combat readability
5. visual feedback
6. UI
7. bots
8. polish

---

## Stopping Condition

Stop only when all are true:

* Milestone 1 is complete
* at least one bot match is playable from start to finish
* the player can win or lose
* terrain destruction affects tactics
* cannon combat feels satisfying
* the game holds 60fps on a mid-range laptop
* every rubric category is at least 8/10
* `PROGRESS.md` contains the full iteration history
* the final commit is created

If these are not true, continue the loop.

---

## Milestone 1

Build the smallest fun version:

* procedural destructible arena
* one human player
* one bot
* real-time movement
* mouse aim
* charge cannon
* projectile physics
* wind
* terrain craters
* health and damage
* knockback
* camera follow
* simple UI
* win/loss
* restart

Do not add extra weapons yet.

---

## Milestone 2

After Milestone 1 feels good, add:

* 4 weapons
* better bot logic
* minimap
* better particles
* procedural audio
* stronger camera polish
* multiple map shapes
* terrain material variation

---

## Milestone 3

After Milestone 2 feels good, add:

* 8–10 weapons
* local 2v2
* round summary
* replay viewer
* sudden death
* arena variants
* better menus
* gamepad support

---

## Final Deliverable

Produce:

* complete working source code
* install instructions
* run instructions
* architecture notes
* gameplay tuning notes
* `PROGRESS.md`
* screenshots
* known limitations

The final result must be a polished real-time 2026 Fortress reboot vertical slice.

Do not stop until the stopping condition fires.
