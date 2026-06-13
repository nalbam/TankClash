import { CANNON, SELECTABLE_WEAPONS, WEAPONS } from "@shared/weapons";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import { AudioManager } from "./audio/audio";
import { InputManager } from "./input/input";
import { NetClient } from "./net/colyseusClient";
import { LocalPredictor } from "./net/predictor";
import { FollowCamera } from "./render/camera";
import { Effects } from "./render/effects";
import { createScene, updateWindParticles } from "./render/scene";
import { TerrainRenderer } from "./render/terrainRenderer";
import { TrajectoryPreview } from "./render/trajectory";
import { VehicleRenderer } from "./render/vehicleRenderer";
import { Hud } from "./ui/hud";

const INPUT_SEND_HZ = 30;

async function boot() {
  const app = document.getElementById("app")!;
  const { renderer, scene, windParticles } = createScene(app);
  const followCam = new FollowCamera(window.innerWidth / window.innerHeight);
  const hud = new Hud();
  const audio = new AudioManager();
  const input = new InputManager(renderer.domElement);
  const effects = new Effects();
  scene.add(effects.group);
  const vehicles = new VehicleRenderer();
  scene.add(vehicles.group);
  const trajectory = new TrajectoryPreview();
  scene.add(trajectory.points);

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    followCam.resize(window.innerWidth / window.innerHeight);
  });
  window.addEventListener("pointerdown", () => audio.unlock(), { once: true });
  window.addEventListener("keydown", () => audio.unlock(), { once: true });

  const net = new NetClient();
  const params = new URLSearchParams(location.search);
  const name = params.get("name") || `Pilot-${Math.floor(Math.random() * 900 + 100)}`;

  window.__tankclash = { connected: false, players: 0, fps: 0, phase: "connecting" };

  try {
    await net.connect(name);
  } catch (err) {
    hud.setConnection(false, 0, 0);
    const overlay = document.getElementById("overlay-msg")!;
    overlay.style.display = "block";
    overlay.textContent = "CANNOT REACH SERVER — IS IT RUNNING ON :2567?";
    console.error("connection failed", err);
    return;
  }

  let terrainRenderer = new TerrainRenderer(net.terrain);
  scene.add(terrainRenderer.group);
  let seenTerrainVersion = net.terrainVersion;

  const predictor = new LocalPredictor();
  let reconciledVersion = net.serverVersion;
  let lastTime = performance.now();
  let inputAccumulator = 0;
  let predictedCharge = 0;
  let fps = 60;

  function frame(now: number) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    const state = net.state;

    // Terrain: full rebuilds on new rounds, incremental on craters.
    if (net.terrainVersion !== seenTerrainVersion) {
      seenTerrainVersion = net.terrainVersion;
      terrainRenderer.rebuildAll(net.terrain);
    }
    for (const crater of net.craterQueue.splice(0)) terrainRenderer.onCrater(crater);
    terrainRenderer.update();

    // Reconcile prediction against the latest authoritative server patch.
    if (net.serverVersion !== reconciledVersion) {
      reconciledVersion = net.serverVersion;
      const auth = net.authoritative(net.sessionId);
      if (auth) {
        if (!auth.alive) predictor.active = false;
        else if (!predictor.active) predictor.reset(auth);
        else predictor.reconcile(auth, net.terrain);
      }
    }

    // Aim from the predicted local position for zero-latency feel.
    if (predictor.active) {
      input.updateAim(followCam.camera, predictor.body.x, predictor.body.y);
    }

    // Sample input at a fixed cadence: send to server AND predict locally.
    inputAccumulator += dt;
    const sendInterval = 1 / INPUT_SEND_HZ;
    while (inputAccumulator >= sendInterval) {
      inputAccumulator -= sendInterval;
      const sample = input.sample();
      net.sendInput(sample);
      predictor.applyInput(sample, net.terrain);
    }
    if (input.consumeRestart() && state?.phase === "ended") {
      net.sendRestart();
    }
    const weaponPick = input.consumeWeaponSelect();
    if (weaponPick !== null && SELECTABLE_WEAPONS[weaponPick]) {
      net.sendSelectWeapon(SELECTABLE_WEAPONS[weaponPick].id);
    }

    const { players, projectiles } = net.interpolated();
    const local = players.get(net.sessionId);
    // Render the local tank from prediction instead of the delayed snapshot.
    if (predictor.active && local) {
      local.x = predictor.body.x;
      local.y = predictor.body.y;
    }

    // Local charge prediction for a responsive meter (uses the selected weapon).
    const localDef = (local && WEAPONS[local.weapon]) || CANNON;
    if (input.charging && local?.alive && local.cooldown <= 0) {
      predictedCharge = Math.min(1, predictedCharge + dt / localDef.chargeTime);
    } else {
      predictedCharge = 0;
    }

    // Events → effects/audio/hud.
    for (const fired of net.firedQueue.splice(0)) {
      effects.spawnMuzzleFlash(fired.x, fired.y, fired.angle);
      audio.fire(fired.power);
      if (fired.playerId === net.sessionId) followCam.shake(0.3 + fired.power * 0.4);
    }
    for (const explosion of net.explosionQueue.splice(0)) {
      effects.spawnExplosion(explosion.x, explosion.y, explosion.r);
      audio.explosion(explosion.r);
      followCam.shake(0.9);
    }
    for (const kill of net.killQueue.splice(0)) {
      hud.addKill(kill.killerName, kill.killerTeam, kill.victimName, kill.victimTeam);
    }

    effects.syncProjectiles(projectiles, dt);
    effects.update(dt);
    vehicles.sync(players);
    if (state) updateWindParticles(windParticles, state.wind, dt);

    // Aim preview: local angle for zero-latency feedback, server constants for truth.
    trajectory.update(
      Boolean(local?.alive && state?.phase === "playing"),
      localDef,
      local?.x ?? 0,
      local?.y ?? 0,
      input.aimAngle,
      input.charging ? Math.max(predictedCharge, 0.05) : 0.3,
      state?.wind ?? 0,
      net.terrain,
    );

    // Camera: keep the local tank and the nearest enemy framed together.
    if (local?.alive) {
      let enemy: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const p of players.values()) {
        if (!p.alive || p.team === local.team) continue;
        const d = Math.abs(p.x - local.x);
        if (d < bestD) {
          bestD = d;
          enemy = p;
        }
      }
      followCam.update(local.x, local.y, Math.cos(local.aimAngle), dt, enemy);
    } else if (players.size > 0) {
      let cx = 0;
      let cy = 0;
      for (const p of players.values()) {
        cx += p.x;
        cy += p.y;
      }
      followCam.update(cx / players.size, cy / players.size, 0, dt);
    } else {
      followCam.update(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.4, 0, dt);
    }

    // HUD.
    hud.setConnection(net.connected, net.ping, fps);
    hud.setLocal(local, predictedCharge);
    if (state) {
      hud.setWind(state.wind);
      hud.setRound(state.phase, state.roundTime, state.winnerTeam);
    }
    hud.updateLabels(players, followCam.camera, net.sessionId);
    hud.updateScoreboard(players, input.scoreboardOpen);

    window.__tankclash = {
      connected: net.connected,
      players: players.size,
      fps: Math.round(fps),
      phase: state?.phase ?? "unknown",
    };

    renderer.render(scene, followCam.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
