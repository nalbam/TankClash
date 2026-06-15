import { CANNON, SELECTABLE_WEAPONS, WEAPONS } from "@shared/weapons";
import { MATCH, WORLD_HEIGHT, WORLD_WIDTH } from "@shared/constants";
import { AudioManager } from "./audio/audio";
import { InputManager } from "./input/input";
import { NetClient, type PlayerView } from "./net/colyseusClient";
import { LocalPredictor } from "./net/predictor";
import { FollowCamera } from "./render/camera";
import { Effects } from "./render/effects";
import { createScene, updateWindParticles } from "./render/scene";
import { TerrainRenderer } from "./render/terrainRenderer";
import { TrajectoryPreview } from "./render/trajectory";
import { VehicleRenderer } from "./render/vehicleRenderer";
import { Hud } from "./ui/hud";
import { LobbyUI } from "./ui/lobby";
import { Minimap } from "./ui/minimap";

const INPUT_SEND_HZ = 30;

const NAME_STORAGE_KEY = "tankclash:name";
const CALLSIGN_ADJ = ["Iron", "Steel", "Rusty", "Viper", "Ghost", "Blitz", "Rogue", "Storm", "Cobra", "Nitro", "Ember", "Frost"];
const CALLSIGN_NOUN = ["Hawk", "Fang", "Bolt", "Wolf", "Tusk", "Reaper", "Drake", "Hammer", "Shard", "Maverick", "Talon", "Razor"];

function randomCallsign(): string {
  const a = CALLSIGN_ADJ[Math.floor(Math.random() * CALLSIGN_ADJ.length)];
  const n = CALLSIGN_NOUN[Math.floor(Math.random() * CALLSIGN_NOUN.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${n}${num}`.slice(0, 16);
}
function readStoredName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

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

  window.__tankclash = { connected: false, players: 0, fps: 0, phase: "browser", screen: "browser", watching: false, isHost: false, countdown: 0, enemyX: 0, paused: false };

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
  let endedAt = 0; // timestamp the match entered "ended" (for the lobby-return countdown)

  // ── HUD element refs for screen-based visibility ────────────────────────────
  const hudStatus = document.getElementById("hud-status")!;
  const hudTop = document.getElementById("hud-top")!;
  const hudNet = document.getElementById("hud-net")!;
  const minimapWrap = document.getElementById("minimap-wrap")!;
  const weaponBar = document.getElementById("weapon-bar")!;
  const killfeed = document.getElementById("killfeed")!;
  const announce = document.getElementById("announce")!;
  const scoreboard = document.getElementById("scoreboard")!;
  const overlayMsg = document.getElementById("overlay-msg")!;
  const setDisplay = (e: HTMLElement, on: boolean) => (e.style.display = on ? (e === announce || e === scoreboard ? "block" : "") : "none");

  // ── Screen orchestration ────────────────────────────────────────────────────
  let appScreen: "browser" | "room" = "browser";
  let browserPoll: ReturnType<typeof setTimeout> | undefined;

  async function pollRooms(): Promise<void> {
    if (appScreen !== "browser") return;
    lobbyUI.renderBrowser(await net.listRooms());
    if (appScreen === "browser") browserPoll = setTimeout(pollRooms, 2000);
  }
  function enterBrowser(): void {
    appScreen = "browser";
    closeMenu();
    net.leaveRoom();
    lobbyUI.hideLobby();
    lobbyUI.showBrowser();
    for (const e of [hudStatus, hudTop, hudNet, minimapWrap, weaponBar, killfeed, announce, scoreboard]) setDisplay(e, false);
    void pollRooms();
  }
  function enterRoom(): void {
    appScreen = "room";
    if (browserPoll) clearTimeout(browserPoll);
    lobbyUI.hideBrowser();
  }
  function showError(msg: string): void {
    overlayMsg.style.display = "block";
    overlayMsg.textContent = msg;
  }

  const lobbyUI = new LobbyUI(
    {
      onCreate: async (mode) => {
        const name = lobbyUI.name || randomCallsign();
        storeName(name);
        try {
          await net.createRoom(name, mode);
          enterRoom();
        } catch (err) {
          console.error("create failed", err);
          showError("CANNOT REACH SERVER — IS IT RUNNING ON :2567?");
        }
      },
      onReroll: () => lobbyUI.setName(randomCallsign()),
    },
    {
      onReadyToggle: () => {
        const me = net.state?.players?.get(net.sessionId);
        net.sendReady(!(me?.ready ?? false));
      },
      onSelectTeam: (team) => net.sendSelectTeam(team),
      onSpectateToggle: () => net.sendSpectator(!net.watching),
      onStart: () => net.sendStart(),
      onLeave: () => enterBrowser(),
    },
  );
  lobbyUI.bindJoin((roomId, asSpectator) =>
    void (async () => {
      const name = lobbyUI.name || randomCallsign();
      storeName(name);
      try {
        await net.joinRoom(roomId, name, { spectator: asSpectator });
        enterRoom();
      } catch {
        void pollRooms();
      }
    })(),
  );
  lobbyUI.setName(readStoredName() || randomCallsign());

  // ── Pause / spectate menu ───────────────────────────────────────────────────
  const pauseMenu = document.getElementById("pause-menu")!;
  const pauseTitle = document.getElementById("pause-title")!;
  const pauseNote = document.getElementById("pause-note")!;
  const resumeBtn = document.getElementById("resume-btn")!;
  const quitBtn = document.getElementById("quit-btn")!;
  let menuOpen = false;

  function openMenu(): void {
    menuOpen = true;
    pauseMenu.style.display = "flex";
    const watching = net.watching;
    pauseTitle.textContent = watching ? "SPECTATING" : "PAUSED";
    pauseNote.textContent = "Esc to resume";
    resumeBtn.textContent = watching ? "Resume Watching" : "Resume";
    if (watching) {
      quitBtn.textContent = "Leave Room";
      quitBtn.onclick = () => enterBrowser();
    } else {
      quitBtn.textContent = "Leave Match";
      quitBtn.onclick = () => {
        net.sendSpectator(true); // die + drop to spectator
        net.sendPause(false);
        closeMenu();
      };
      net.sendPause(true); // solo match freezes while paused
    }
  }
  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    pauseMenu.style.display = "none";
    if (!net.watching) net.sendPause(false);
  }
  resumeBtn.addEventListener("click", () => closeMenu());

  // ── Autostart fast-path (screenshot gate / shareable links) ─────────────────
  if (params.has("autostart") || params.has("name")) {
    const name = (params.get("name") || readStoredName() || randomCallsign()).slice(0, 16);
    const mode = params.get("mode") === "2v2" ? "2v2" : "1v1";
    storeName(name);
    try {
      await net.createRoom(name, mode);
      enterRoom();
      net.sendReady(true);
      net.sendStart(); // host auto-starts; bots fill the other slots
    } catch (err) {
      console.error("autostart failed", err);
      showError("CANNOT REACH SERVER — IS IT RUNNING ON :2567?");
    }
  } else {
    enterBrowser();
  }

  function fighterCount(state: any): number {
    if (!state?.players) return 0;
    let n = 0;
    state.players.forEach((p: any) => {
      if (!p.spectator) n++;
    });
    return n;
  }

  function frame(now: number) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    const state = net.state;
    const phase: string = state?.phase ?? "browser";
    const inRoom = appScreen === "room" && net.connected;
    const inGame = inRoom && (phase === "playing" || phase === "ended");
    const inLobby = inRoom && (phase === "lobby" || phase === "countdown");
    const watching = net.watching;

    // Countdown to the automatic lobby return shown on the win screen.
    if (phase === "ended") {
      if (endedAt === 0) endedAt = now;
    } else {
      endedAt = 0;
    }
    const endRemaining = phase === "ended" ? Math.max(0, MATCH.END_PAUSE_S - (now - endedAt) / 1000) : 0;

    // Terrain: full rebuilds on new rounds, incremental on craters.
    const terrainChanged = net.terrainVersion !== seenTerrainVersion;
    if (terrainChanged) {
      seenTerrainVersion = net.terrainVersion;
      terrainRenderer.rebuildAll(net.terrain);
    }
    const hadCraters = net.craterQueue.length > 0;
    for (const crater of net.craterQueue.splice(0)) terrainRenderer.onCrater(crater);
    terrainRenderer.update();

    // Input / Esc menu. Esc is locked during the lobby and countdown.
    input.pollGamepad();
    if (input.consumePauseToggle() && inGame) {
      menuOpen ? closeMenu() : openMenu();
    }
    if (inRoom && input.consumeRestart() && phase === "ended") net.sendRestart();

    const canControl = inRoom && phase === "playing" && !watching && !menuOpen;
    if (canControl) {
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
      if (predictor.active && !input.gamepadAiming) {
        input.updateAim(followCam.camera, predictor.body.x, predictor.body.y);
      }
      inputAccumulator += dt;
      const sendInterval = 1 / INPUT_SEND_HZ;
      while (inputAccumulator >= sendInterval) {
        inputAccumulator -= sendInterval;
        const sample = input.sample();
        net.sendInput(sample);
        predictor.applyInput(sample, net.terrain);
      }
      const weaponPick = input.consumeWeaponSelect();
      if (weaponPick !== null && SELECTABLE_WEAPONS[weaponPick]) {
        net.sendSelectWeapon(SELECTABLE_WEAPONS[weaponPick].id);
      }
      const cycle = input.consumeWeaponCycle();
      const localWeapon = net.authoritative(net.sessionId)?.weapon;
      if (cycle !== 0 && localWeapon) {
        const idx = SELECTABLE_WEAPONS.findIndex((w) => w.id === localWeapon);
        if (idx >= 0) {
          const next = (idx + cycle + SELECTABLE_WEAPONS.length) % SELECTABLE_WEAPONS.length;
          net.sendSelectWeapon(SELECTABLE_WEAPONS[next].id);
        }
      }
    } else {
      predictor.active = false;
    }

    const { players, projectiles } = net.interpolated();
    // Spectators have no tank — keep them out of combat rendering.
    const tankPlayers = new Map<string, PlayerView>();
    for (const [id, p] of players) if (!p.spectator) tankPlayers.set(id, p);

    const local = tankPlayers.get(net.sessionId);
    if (predictor.active && local) {
      local.x = predictor.body.x;
      local.y = predictor.body.y;
    }

    const localDef = (local && WEAPONS[local.weapon]) || CANNON;
    if (canControl && input.charging && local?.alive && local.cooldown <= 0) {
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
    vehicles.sync(tankPlayers);
    if (state) updateWindParticles(windParticles, state.wind, dt);

    trajectory.update(
      Boolean(local?.alive && phase === "playing" && !watching),
      localDef,
      local?.x ?? 0,
      local?.y ?? 0,
      input.aimAngle,
      input.charging ? Math.max(predictedCharge, 0.05) : 0.3,
      state?.wind ?? 0,
      net.terrain,
    );

    // Camera: frame the local tank + nearest enemy, or pan across the arena.
    if (!watching && local?.alive) {
      let enemy: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const p of tankPlayers.values()) {
        if (!p.alive || p.team === local.team) continue;
        const d = Math.abs(p.x - local.x);
        if (d < bestD) {
          bestD = d;
          enemy = p;
        }
      }
      followCam.update(local.x, local.y, Math.cos(local.aimAngle), dt, enemy);
    } else if (tankPlayers.size > 0) {
      let cx = 0;
      let cy = 0;
      for (const p of tankPlayers.values()) {
        cx += p.x;
        cy += p.y;
      }
      followCam.update(cx / tankPlayers.size, cy / tankPlayers.size, 0, dt);
    } else {
      followCam.update(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.4, 0, dt);
    }

    // ── Screen-driven HUD/overlay visibility ──────────────────────────────────
    if (inLobby) {
      lobbyUI.showLobby();
      if (state) lobbyUI.renderLobby(state, net.sessionId);
      for (const e of [hudStatus, hudTop, hudNet, minimapWrap, weaponBar, killfeed, announce, scoreboard]) setDisplay(e, false);
    } else if (inGame) {
      lobbyUI.hideLobby();
      setDisplay(hudStatus, !watching);
      setDisplay(weaponBar, !watching);
      for (const e of [hudTop, hudNet, minimapWrap]) setDisplay(e, true);
      setDisplay(killfeed, true);
    }

    hud.setConnection(net.connected, net.ping, fps);
    if (inGame) {
      hud.setLocal(watching ? undefined : local, predictedCharge);
      if (state) {
        hud.setWind(state.wind);
        hud.setRound(phase, state.roundTime, state.winnerTeam, endRemaining);
      }
      hud.updateLabels(tankPlayers, followCam.camera, net.sessionId);
      hud.updateScoreboard(tankPlayers, input.scoreboardOpen || phase === "ended");
      minimap.update(net.terrain, tankPlayers, net.sessionId, terrainChanged || hadCraters);
    } else {
      hud.updateLabels(new Map(), followCam.camera, net.sessionId);
    }

    if (net.reconnecting) {
      overlayMsg.style.display = "block";
      overlayMsg.textContent = "CONNECTION LOST — RECONNECTING…";
    } else if (overlayMsg.textContent === "CONNECTION LOST — RECONNECTING…") {
      overlayMsg.style.display = "none";
    }

    let enemyX = 0;
    for (const [id, p] of tankPlayers) {
      if (id !== net.sessionId) {
        enemyX = p.x;
        break;
      }
    }
    window.__tankclash = {
      connected: net.connected,
      players: fighterCount(state),
      fps: Math.round(fps),
      phase: inRoom ? phase : "browser",
      screen: appScreen,
      watching,
      isHost: net.sessionId === state?.hostId,
      countdown: state?.countdown ?? 0,
      enemyX,
      paused: menuOpen,
    };

    renderer.render(scene, followCam.camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
