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
import { Minimap } from "./ui/minimap";

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

  window.__tankclash = { connected: false, players: 0, fps: 0, phase: "menu", enemyX: 0, paused: false };

  const choice = await showMenu(params);
  window.__tankclash!.phase = "connecting";

  try {
    await net.connect(choice.name, { mode: choice.mode, spectator: choice.spectator });
  } catch (err) {
    hud.setConnection(false, 0, 0);
    const overlay = document.getElementById("overlay-msg")!;
    overlay.style.display = "block";
    overlay.textContent = "CANNOT REACH SERVER — IS IT RUNNING ON :2567?";
    console.error("connection failed", err);
    return;
  }

  // Spectators control no tank — hide the player-only HUD.
  if (net.spectator) {
    document.getElementById("hud-status")!.style.display = "none";
    document.getElementById("weapon-bar")!.style.display = "none";
  }

  let terrainRenderer = new TerrainRenderer(net.terrain);
  scene.add(terrainRenderer.group);
  let seenTerrainVersion = net.terrainVersion;

  const minimap = new Minimap();
  minimap.rebuild(net.terrain);

  const predictor = new LocalPredictor();
  let reconciledVersion = net.serverVersion;
  let lastTime = performance.now();
  let inputAccumulator = 0;
  let predictedCharge = 0;
  let fps = 60;

  // Pause menu: Esc/Start toggles, Resume closes, Quit returns to the lobby.
  let paused = false;
  const pauseMenu = document.getElementById("pause-menu")!;
  const setPaused = (next: boolean) => {
    paused = next;
    pauseMenu.style.display = paused ? "flex" : "none";
    net.sendPause(paused);
  };
  document.getElementById("resume-btn")!.addEventListener("click", () => setPaused(false));
  document.getElementById("quit-btn")!.addEventListener("click", () => {
    net.sendPause(false);
    location.reload(); // back to a clean lobby
  });

  function frame(now: number) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    const state = net.state;

    // Terrain: full rebuilds on new rounds, incremental on craters.
    const terrainChanged = net.terrainVersion !== seenTerrainVersion;
    if (terrainChanged) {
      seenTerrainVersion = net.terrainVersion;
      terrainRenderer.rebuildAll(net.terrain);
    }
    const hadCraters = net.craterQueue.length > 0;
    for (const crater of net.craterQueue.splice(0)) terrainRenderer.onCrater(crater);
    terrainRenderer.update();

    // Players predict and send input; spectators just watch.
    if (!net.spectator) {
      input.pollGamepad();

      if (input.consumePauseToggle()) setPaused(!paused);
    }

    // While paused, hold position (no input) but keep rendering the world.
    if (!net.spectator && !paused) {

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

      // Aim from the predicted local position; mouse unless the pad's stick is active.
      if (predictor.active && !input.gamepadAiming) {
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
      // Gamepad shoulder buttons cycle through the weapon list.
      const cycle = input.consumeWeaponCycle();
      const localWeapon = net.authoritative(net.sessionId)?.weapon;
      if (cycle !== 0 && localWeapon) {
        const idx = SELECTABLE_WEAPONS.findIndex((w) => w.id === localWeapon);
        if (idx >= 0) {
          const next = (idx + cycle + SELECTABLE_WEAPONS.length) % SELECTABLE_WEAPONS.length;
          net.sendSelectWeapon(SELECTABLE_WEAPONS[next].id);
        }
      }
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
      effects.spawnMuzzleFlash(fired.x, fired.y, fired.angle, fired.weapon);
      audio.fire(fired.power);
      if (fired.playerId === net.sessionId) followCam.shake(0.3 + fired.power * 0.4);
    }
    for (const explosion of net.explosionQueue.splice(0)) {
      effects.spawnExplosion(explosion.x, explosion.y, explosion.r, explosion.weapon);
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
    // Round summary: auto-show the scoreboard while a round is over.
    hud.updateScoreboard(players, input.scoreboardOpen || state?.phase === "ended");
    minimap.update(net.terrain, players, net.sessionId, terrainChanged || hadCraters);

    // Reconnect banner overrides the waiting/empty overlay while a drop heals.
    if (net.reconnecting) {
      const overlay = document.getElementById("overlay-msg")!;
      overlay.style.display = "block";
      overlay.textContent = "CONNECTION LOST — RECONNECTING…";
    }

    let enemyX = 0;
    for (const [id, p] of players) {
      if (id !== net.sessionId) {
        enemyX = p.x;
        break;
      }
    }
    window.__tankclash = {
      connected: net.connected,
      players: players.size,
      fps: Math.round(fps),
      phase: state?.phase ?? "unknown",
      enemyX,
      paused,
    };

    renderer.render(scene, followCam.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

interface MenuChoice {
  name: string;
  mode: string;
  spectator: boolean;
}

const NAME_STORAGE_KEY = "tankclash:name";
const CALLSIGN_ADJ = ["Iron", "Steel", "Rusty", "Viper", "Ghost", "Blitz", "Rogue", "Storm", "Cobra", "Nitro", "Ember", "Frost"];
const CALLSIGN_NOUN = ["Hawk", "Fang", "Bolt", "Wolf", "Tusk", "Reaper", "Drake", "Hammer", "Shard", "Maverick", "Talon", "Razor"];

function randomCallsign(): string {
  const a = CALLSIGN_ADJ[Math.floor(Math.random() * CALLSIGN_ADJ.length)];
  const n = CALLSIGN_NOUN[Math.floor(Math.random() * CALLSIGN_NOUN.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${n}${num}`.slice(0, 16);
}

/**
 * Lobby menu. Resolves on Play. The call sign is remembered in localStorage and
 * pre-filled (a fresh random one on first visit); the 🎲 button rerolls it.
 * URL params (?name=… or ?autostart) skip the menu — used by the screenshot
 * gate and shareable links.
 */
function showMenu(params: URLSearchParams): Promise<MenuChoice> {
  const menu = document.getElementById("menu")!;
  const toChoice = (name: string, mode: string): MenuChoice => ({
    name,
    mode: mode === "2v2" ? "2v2" : "1v1",
    spectator: mode === "spectate",
  });

  const readStoredName = (): string => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  };
  const storeName = (name: string): void => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch {
      /* storage unavailable (private mode) — ignore */
    }
  };

  if (params.has("name") || params.has("autostart")) {
    menu.style.display = "none";
    return Promise.resolve(toChoice(params.get("name") || readStoredName() || randomCallsign(), params.get("mode") || "1v1"));
  }

  return new Promise((resolve) => {
    let mode = "1v1";
    const buttons = [...menu.querySelectorAll<HTMLDivElement>(".mode-btn")];
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        for (const b of buttons) b.classList.remove("active");
        btn.classList.add("active");
        mode = btn.dataset.mode ?? "1v1";
      });
    }

    const nameInput = document.getElementById("menu-name") as HTMLInputElement;
    // Remembered name, or a fresh random one on first visit.
    nameInput.value = readStoredName() || randomCallsign();
    document.getElementById("reroll-btn")!.addEventListener("click", () => {
      nameInput.value = randomCallsign();
      nameInput.focus();
    });

    const play = () => {
      const name = nameInput.value.trim() || randomCallsign();
      storeName(name);
      menu.style.display = "none";
      resolve(toChoice(name, mode));
    };
    document.getElementById("play-btn")!.addEventListener("click", play);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") play();
    });
  });
}

boot();
