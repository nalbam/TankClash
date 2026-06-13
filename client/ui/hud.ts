import * as THREE from "three";
import { MATCH, PLAYER_MAX_HEALTH } from "@shared/constants";
import type { PlayerView } from "../net/colyseusClient";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface LabelEntry {
  root: HTMLDivElement;
  hp: HTMLDivElement;
  lastHealth: number;
}

/** DOM HUD: status bars, wind, timer, kill feed, labels, damage numbers. */
export class Hud {
  private healthFill = el<HTMLDivElement>("health-fill");
  private cooldownText = el<HTMLDivElement>("hud-cooldown");
  private windArrow = el<HTMLSpanElement>("wind-arrow");
  private windValue = el<HTMLSpanElement>("wind-value");
  private roundTimer = el<HTMLDivElement>("round-timer");
  private connDot = el<HTMLSpanElement>("conn-dot");
  private connText = el<HTMLSpanElement>("conn-text");
  private pingEl = el<HTMLSpanElement>("ping");
  private fpsEl = el<HTMLSpanElement>("fps");
  private chargeWrap = el<HTMLDivElement>("charge-wrap");
  private chargeFill = el<HTMLDivElement>("charge-fill");
  private killfeed = el<HTMLDivElement>("killfeed");
  private announce = el<HTMLDivElement>("announce");
  private announceTitle = el<HTMLHeadingElement>("announce-title");
  private scoreboard = el<HTMLDivElement>("scoreboard");
  private scoreboardBody = el<HTMLTableSectionElement>("scoreboard-body");
  private labelsRoot = el<HTMLDivElement>("labels");
  private overlayMsg = el<HTMLDivElement>("overlay-msg");

  private labels = new Map<string, LabelEntry>();
  private projVec = new THREE.Vector3();

  setConnection(connected: boolean, ping: number, fps: number): void {
    this.connDot.className = connected ? "ok" : "bad";
    this.connText.textContent = connected ? "connected" : "disconnected";
    this.pingEl.textContent = connected ? String(ping) : "–";
    this.fpsEl.textContent = `${Math.round(fps)} fps`;
  }

  setLocal(view: PlayerView | undefined, predictedCharge: number): void {
    if (!view) return;
    this.healthFill.style.width = `${(Math.max(0, view.health) / PLAYER_MAX_HEALTH) * 100}%`;
    this.healthFill.style.background = view.health > 35 ? "" : "linear-gradient(90deg,#ff5d5d,#ff8c2e)";
    this.cooldownText.textContent = view.cooldown > 0 ? `RELOAD ${view.cooldown.toFixed(1)}s` : "READY";

    const charge = view.charging ? Math.max(view.charge, predictedCharge) : predictedCharge;
    if (charge > 0.01) {
      this.chargeWrap.style.display = "block";
      this.chargeFill.style.width = `${charge * 100}%`;
    } else {
      this.chargeWrap.style.display = "none";
    }
  }

  setWind(wind: number): void {
    const mag = Math.abs(wind);
    const chevrons = Math.max(1, Math.min(5, Math.ceil(mag / 2)));
    this.windArrow.textContent = mag < 0.3 ? "·" : (wind > 0 ? "❯" : "❮").repeat(chevrons);
    this.windValue.textContent = mag.toFixed(1);
  }

  setRound(phase: string, roundTime: number, winnerTeam: string): void {
    const remaining = Math.max(0, MATCH.ROUND_TIME_S - roundTime);
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    this.roundTimer.textContent = phase === "playing" && remaining === 0 ? "SUDDEN DEATH" : `${m}:${String(s).padStart(2, "0")}`;

    if (phase === "ended") {
      this.announce.style.display = "block";
      if (winnerTeam) {
        this.announceTitle.textContent = `${winnerTeam.toUpperCase()} WINS`;
        this.announceTitle.style.color = winnerTeam === "blue" ? "var(--blue)" : "var(--red)";
      } else {
        this.announceTitle.textContent = "DRAW";
        this.announceTitle.style.color = "var(--cream)";
      }
    } else {
      this.announce.style.display = "none";
    }

    this.overlayMsg.style.display = phase === "waiting" ? "block" : "none";
    if (phase === "waiting") this.overlayMsg.textContent = "WAITING FOR OPPONENT…";
  }

  addKill(killerName: string, killerTeam: string, victimName: string, victimTeam: string): void {
    const entry = document.createElement("div");
    entry.className = "kill-entry panel";
    entry.innerHTML =
      killerName === victimName
        ? `<span class="team-${victimTeam}">${victimName}</span> 💀`
        : `<span class="team-${killerTeam}">${killerName}</span> ☄ <span class="team-${victimTeam}">${victimName}</span>`;
    this.killfeed.prepend(entry);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild?.remove();
    setTimeout(() => entry.remove(), 6000);
  }

  /** Name + health labels above tanks, plus floating damage numbers. */
  updateLabels(players: Map<string, PlayerView>, camera: THREE.Camera, localId: string): void {
    for (const [id, view] of players) {
      let label = this.labels.get(id);
      if (!label) {
        const root = document.createElement("div");
        root.className = "tank-label";
        const name = document.createElement("div");
        name.className = `tank-name team-${view.team}`;
        name.textContent = view.name + (id === localId ? " (you)" : "");
        const hpWrap = document.createElement("div");
        hpWrap.className = "tank-hp";
        const hp = document.createElement("div");
        hpWrap.appendChild(hp);
        root.append(name, hpWrap);
        this.labelsRoot.appendChild(root);
        label = { root, hp, lastHealth: view.health };
        this.labels.set(id, label);
      }

      const screen = this.toScreen(view.x, view.y + 2.4, camera);
      label.root.style.left = `${screen.x}px`;
      label.root.style.top = `${screen.y}px`;
      label.root.style.display = view.alive && screen.visible ? "block" : "none";
      label.hp.style.width = `${(Math.max(0, view.health) / PLAYER_MAX_HEALTH) * 100}%`;
      label.hp.style.background = view.health > 35 ? "#38e07b" : "#ff8c2e";

      // Damage numbers on health drops.
      if (view.health < label.lastHealth - 0.5 && view.alive) {
        this.spawnDamageNumber(screen.x, screen.y - 8, Math.round(label.lastHealth - view.health));
      }
      label.lastHealth = view.health;
    }

    for (const id of [...this.labels.keys()]) {
      if (!players.has(id)) {
        this.labels.get(id)!.root.remove();
        this.labels.delete(id);
      }
    }
  }

  updateScoreboard(players: Map<string, PlayerView>, open: boolean): void {
    this.scoreboard.style.display = open ? "block" : "none";
    if (!open) return;
    const rows = [...players.values()]
      .sort((a, b) => b.kills - a.kills)
      .map(
        (p) =>
          `<tr><td>${p.name}</td><td class="team-${p.team}">${p.team}</td><td>${p.kills}</td><td>${Math.ceil(p.health)}</td></tr>`,
      )
      .join("");
    this.scoreboardBody.innerHTML = rows;
  }

  private spawnDamageNumber(x: number, y: number, amount: number): void {
    const div = document.createElement("div");
    div.className = "dmg-float";
    div.textContent = `-${amount}`;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    this.labelsRoot.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }

  private toScreen(x: number, y: number, camera: THREE.Camera): { x: number; y: number; visible: boolean } {
    this.projVec.set(x, y, 0).project(camera);
    return {
      x: (this.projVec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.projVec.y * 0.5 + 0.5) * window.innerHeight,
      visible: this.projVec.z < 1 && Math.abs(this.projVec.x) < 1.2 && Math.abs(this.projVec.y) < 1.2,
    };
  }
}
