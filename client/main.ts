import { CANNON } from "@shared/weapons";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import { AudioManager } from "./audio/audio";
import { InputManager } from "./input/input";
import { NetClient } from "./net/colyseusClient";
import { FollowCamera } from "./render/camera";
import { Effects } from "./render/effects";
import { createScene, updateWindParticles } from "./render/scene";
import { TerrainRenderer } from "./render/terrainRenderer";
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

  let lastTime = performance.now();
  let inputAccumulator = 0;
  let predictedCharge = 0;
  let fps = 60;

  function frame(now: number) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    const state = net.state;
    const { players, projectiles } = net.interpolated();
    const local = players.get(net.sessionId);

    // Terrain: full rebuilds on new rounds, incremental on craters.
    if (net.terrainVersion !== seenTerrainVersion) {
      seenTerrainVersion = net.terrainVersion;
      terrainRenderer.rebuildAll(net.terrain);
    }
    for (const crater of net.craterQueue.splice(0)) terrainRenderer.onCrater(crater);
    terrainRenderer.update();

    // Input → server at fixed cadence.
    if (local?.alive) {
      input.updateAim(followCam.camera, local.x, local.y);
    }
    inputAccumulator += dt;
    const sendInterval = 1 / INPUT_SEND_HZ;
    while (inputAccumulator >= sendInterval) {
      inputAccumulator -= sendInterval;
      net.sendInput(input.sample());
    }
    if (input.consumeRestart() && state?.phase === "ended") {
      net.sendRestart();
    }

    // Local charge prediction for a responsive meter.
    if (input.charging && local?.alive && local.cooldown <= 0) {
      predictedCharge = Math.min(1, predictedCharge + dt / CANNON.chargeTime);
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

    // Camera: follow local tank; otherwise frame the action.
    if (local?.alive) {
      followCam.update(local.x, local.y, Math.cos(local.aimAngle), dt);
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
