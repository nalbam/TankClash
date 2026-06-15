import type { RoomListing } from "../net/colyseusClient";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export interface BrowserCallbacks {
  onCreate: (mode: "1v1" | "2v2") => void;
  onReroll: () => void;
}

export interface LobbyCallbacks {
  onReadyToggle: () => void;
  onSelectTeam: (team: "blue" | "red") => void;
  onSpectate: () => void;
  onStart: () => void;
  onLeave: () => void;
}

/** Minimal view of the synced state the lobby needs (subset of GameState). */
interface LobbyState {
  phase: string;
  hostId: string;
  countdown: number;
  roomCode: string;
  players: { forEach: (cb: (p: any, id: string) => void) => void };
}

/**
 * Owns the two pre-game screens: the room browser (list + create) and the
 * in-room lobby (team columns, ready, host start, countdown). Reads from the
 * synced schema each frame; mutations go back through the callbacks.
 */
export class LobbyUI {
  private browser = el<HTMLDivElement>("browser");
  private nameInput = el<HTMLInputElement>("browser-name");
  private roomList = el<HTMLDivElement>("room-list");
  private roomEmpty = el<HTMLDivElement>("room-empty");

  private lobby = el<HTMLDivElement>("lobby");
  private title = el<HTMLDivElement>("lobby-title");
  private code = el<HTMLDivElement>("lobby-code");
  private blueCol = el<HTMLDivElement>("lobby-blue");
  private redCol = el<HTMLDivElement>("lobby-red");
  private specCol = el<HTMLDivElement>("lobby-spectators");
  private readyBtn = el<HTMLButtonElement>("lobby-ready");
  private startBtn = el<HTMLButtonElement>("lobby-start");
  private leaveBtn = el<HTMLButtonElement>("lobby-leave");
  private countdownEl = el<HTMLDivElement>("lobby-countdown");

  /** True during the start countdown — team-box clicks are locked. */
  private counting = false;

  constructor(browserCbs: BrowserCallbacks, lobbyCbs: LobbyCallbacks) {
    el<HTMLButtonElement>("create-1v1").addEventListener("click", () => browserCbs.onCreate("1v1"));
    el<HTMLButtonElement>("create-2v2").addEventListener("click", () => browserCbs.onCreate("2v2"));
    el<HTMLButtonElement>("browser-reroll").addEventListener("click", () => browserCbs.onReroll());

    this.readyBtn.addEventListener("click", () => lobbyCbs.onReadyToggle());
    // Clicking a team box switches onto that team (the server rejects a full side).
    this.blueCol.addEventListener("click", () => {
      if (!this.counting) lobbyCbs.onSelectTeam("blue");
    });
    this.redCol.addEventListener("click", () => {
      if (!this.counting) lobbyCbs.onSelectTeam("red");
    });
    // Clicking the spectator box drops to watching (rejoin a team via a team box).
    this.specCol.addEventListener("click", () => {
      if (!this.counting) lobbyCbs.onSpectate();
    });
    this.startBtn.addEventListener("click", () => lobbyCbs.onStart());
    this.leaveBtn.addEventListener("click", () => lobbyCbs.onLeave());
  }

  get name(): string {
    return this.nameInput.value.trim();
  }
  setName(v: string): void {
    this.nameInput.value = v;
  }

  showBrowser(): void {
    this.browser.style.display = "flex";
  }
  hideBrowser(): void {
    this.browser.style.display = "none";
  }
  showLobby(): void {
    this.lobby.style.display = "flex";
  }
  hideLobby(): void {
    this.lobby.style.display = "none";
  }

  renderBrowser(rooms: RoomListing[]): void {
    this.roomList.innerHTML = "";
    this.roomEmpty.style.display = rooms.length === 0 ? "block" : "none";
    for (const r of rooms) {
      const open = r.phase === "lobby" && r.humans < r.capacity;
      const row = document.createElement("div");
      row.className = "room-row";
      row.dataset.roomId = r.roomId;
      const status = open ? "JOIN" : "WATCH";
      const phaseLabel =
        r.phase === "lobby" ? "in lobby" : r.phase === "countdown" ? "starting" : r.phase === "ended" ? "round over" : "in battle";
      row.innerHTML =
        `<div class="room-info">` +
        `<span class="room-mode">${r.mode.toUpperCase()}${r.code ? ` <span class="room-code">${r.code}</span>` : ""}</span>` +
        `<span class="room-host">${r.host || "—"}</span>` +
        `<span class="room-meta">${r.humans}/${r.capacity} players · ${phaseLabel}</span>` +
        `</div><span class="room-join ${open ? "open" : "watch"}">${status}</span>`;
      row.addEventListener("click", () => this.joinCb?.(r.roomId, !open));
      this.roomList.appendChild(row);
    }
  }

  /** Stored so renderBrowser rows can call back without rebuilding closures. */
  private joinCb?: (roomId: string, asSpectator: boolean) => void;
  bindJoin(cb: (roomId: string, asSpectator: boolean) => void): void {
    this.joinCb = cb;
  }

  renderLobby(state: LobbyState, sessionId: string): void {
    const blue: string[] = [];
    const red: string[] = [];
    const specs: string[] = [];
    let me: any;
    state.players.forEach((p: any, id: string) => {
      if (id === sessionId) me = p;
      const tag = (txt: string) => {
        const you = id === sessionId ? " (you)" : "";
        const host = id === state.hostId ? " 👑" : "";
        const bot = p.isBot ? " 🤖" : "";
        const ready = !p.spectator && !p.isBot ? (p.ready ? " ✓" : " ·") : "";
        return `<div class="slot ${id === sessionId ? "me" : ""}">${txt}${you}${bot}${host}<span class="ready">${ready}</span></div>`;
      };
      if (p.spectator) specs.push(tag(p.name));
      else if (p.team === "red") red.push(tag(p.name));
      else blue.push(tag(p.name));
    });
    this.blueCol.innerHTML = `<div class="team-head team-blue">BLUE</div>${blue.join("") || '<div class="slot empty">— open —</div>'}`;
    this.redCol.innerHTML = `<div class="team-head team-red">RED</div>${red.join("") || '<div class="slot empty">— open —</div>'}`;
    this.specCol.innerHTML = `<div class="team-head">SPECTATORS</div>${
      specs.join("") || '<div class="slot empty">— click to spectate —</div>'
    }`;

    const watching = !me || me.spectator === true;
    const isHost = sessionId === state.hostId;
    const counting = state.phase === "countdown";
    this.counting = counting;

    // Team / spectator boxes are clickable in the lobby, locked during the countdown.
    this.blueCol.classList.toggle("locked", counting);
    this.redCol.classList.toggle("locked", counting);
    this.specCol.classList.toggle("locked", counting);

    this.countdownEl.style.display = counting ? "block" : "none";
    if (counting) this.countdownEl.textContent = `STARTING IN ${Math.ceil(state.countdown)}`;
    this.title.textContent = counting ? "GET READY" : "LOBBY";
    this.code.textContent = state.roomCode ? `ROOM CODE · ${state.roomCode}` : "";

    // Action buttons are hidden during the countdown (leaving is locked).
    const showActions = !counting;
    this.readyBtn.style.display = showActions && !watching ? "" : "none";
    this.readyBtn.textContent = me?.ready ? "CANCEL" : "READY";
    this.readyBtn.classList.toggle("on", Boolean(me?.ready));
    this.startBtn.style.display = showActions && isHost ? "" : "none";
    this.leaveBtn.style.display = showActions ? "" : "none";
  }
}
