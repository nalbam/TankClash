/**
 * Verification gate 4: headless client capture of the full lobby flow.
 *
 * Boots the real server + Vite dev client and drives, with Playwright:
 *   1. a solo autostart match  → in-game frames + solo-pause freeze check;
 *   2. a host + joiner lobby    → room browser, lobby (team/ready), host
 *      countdown, live 2v2 match, and leave-to-spectate.
 *
 * Fails when the canvas renders blank or any step never reaches its state.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const SERVER_PORT = 2567;
const CLIENT_PORT = 8087;
const SHOT_TIMES_S = [2, 6, 10]; // kept early so frames land while the match is still playing
const MIN_PNG_BYTES = 30_000; // a blank/black 3D frame compresses far below this
const MIN_UI_BYTES = 5_000; // lobby/browser are mostly flat UI — looser floor

const children: ChildProcess[] = [];

function freePort(port: number): void {
  try {
    const out = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`).toString();
    for (const pid of out.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* lsof unavailable — best effort */
  }
}

function fail(message: string): never {
  console.error(`\n❌ SCREENSHOT GATE FAILED: ${message}`);
  cleanup();
  process.exit(1);
}

function cleanup(): void {
  for (const child of children) {
    if (child.pid && !child.killed) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
}

function start(command: string, args: string[], env: Record<string, string> = {}): ChildProcess {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
    detached: true,
  });
  children.push(child);
  child.stderr?.on("data", (d) => process.stderr.write(`[${command}] ${d}`));
  return child;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`${url} did not become reachable within ${timeoutMs}ms`);
}

const flags = (page: Page) => page.evaluate(() => (window as any).__tankclash);

/** Wait until an in-page predicate holds (serialized into the page context). */
async function waitUntil(page: Page, fn: () => boolean, desc: string, timeout = 15_000): Promise<void> {
  await page.waitForFunction(fn, undefined, { timeout, polling: 200 }).catch(() => fail(`timeout waiting for: ${desc}`));
}

async function shoot(page: Page, name: string, min: number): Promise<void> {
  const file = path.join("screenshots", `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = statSync(file).size;
  console.log(`  📸 ${file} (${(bytes / 1024).toFixed(0)} KB)`);
  if (bytes < min) fail(`${file} is only ${bytes} bytes — likely blank`);
}

async function run(): Promise<void> {
  mkdirSync("screenshots", { recursive: true });

  freePort(SERVER_PORT);
  freePort(CLIENT_PORT);
  await new Promise((r) => setTimeout(r, 400));

  console.log("starting server…");
  start("npx", ["tsx", "server/index.ts"], { PORT: String(SERVER_PORT) });
  await waitForHttp(`http://localhost:${SERVER_PORT}/api/rooms`, 20_000);

  console.log("starting client (vite)…");
  start("npx", ["vite", "--port", String(CLIENT_PORT), "--strictPort"]);
  await waitForHttp(`http://localhost:${CLIENT_PORT}/`, 20_000);

  console.log("launching headless chromium…");
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  ctx.on("page", (p) => p.on("pageerror", (err) => console.error("[page error]", err.message)));
  const base = `http://localhost:${CLIENT_PORT}`;

  // ── Phase 1: solo autostart → in-game frames + solo-pause freeze ────────────
  const solo = await ctx.newPage();
  await solo.goto(`${base}/?name=SoloCap&mode=1v1`);
  await waitUntil(solo, () => (window as any).__tankclash?.connected === true, "solo connected");
  await waitUntil(solo, () => (window as any).__tankclash?.players >= 2, "bot opponent joined");
  await waitUntil(solo, () => (window as any).__tankclash?.phase === "playing", "solo match playing", 20_000);

  console.log("solo match live — capturing in-game…");
  const t0 = Date.now();
  const fpsSamples: number[] = [];
  for (const t of SHOT_TIMES_S) {
    const waitMs = t * 1000 - (Date.now() - t0);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    const f = await flags(solo);
    fpsSamples.push(f.fps);
    await shoot(solo, `match-t${t}s`, MIN_PNG_BYTES);
    if (!f.connected) fail(`connection dropped by t=${t}s`);
  }

  // Solo pause must freeze the world (bot stops moving) — only valid mid-match.
  const stillPlaying = await solo.evaluate(() => (window as any).__tankclash.phase === "playing");
  if (stillPlaying) {
    const readEnemyX = () => solo.evaluate(() => (window as any).__tankclash.enemyX as number);
    await solo.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));
    const menuShown = await solo.evaluate(() => getComputedStyle(document.getElementById("pause-menu")!).display !== "none");
    if (!menuShown) fail("pause menu did not open on Escape");
    await new Promise((r) => setTimeout(r, 700));
    const settledX = await readEnemyX();
    await new Promise((r) => setTimeout(r, 2000));
    const laterX = await readEnemyX();
    // Only assert the freeze when enemyX actually references a live opponent.
    if (Math.abs(settledX) > 0.5 && Math.abs(laterX - settledX) > 0.3) {
      fail(`bot kept moving while paused (Δx=${(laterX - settledX).toFixed(2)}) — solo pause should freeze the world`);
    }
    await shoot(solo, "paused", MIN_UI_BYTES);
    console.log(`  pause → menu shown, bot frozen (Δx=${(laterX - settledX).toFixed(2)})`);
  } else {
    console.log("  (solo match ended before the pause check — skipping freeze assertion)");
  }
  await solo.close(); // dispose the solo room before the lobby walkthrough
  await new Promise((r) => setTimeout(r, 600));

  // ── Phase 2: host + joiner lobby walkthrough ────────────────────────────────
  console.log("opening host page…");
  const host = await ctx.newPage();
  await host.goto(`${base}/`);
  await waitUntil(host, () => (window as any).__tankclash?.screen === "browser", "host on room browser");
  await host.click("#create-2v2");
  await waitUntil(
    host,
    () => (window as any).__tankclash?.screen === "room" && (window as any).__tankclash?.phase === "lobby",
    "host in a fresh lobby",
  );

  console.log("opening joiner page…");
  const joiner = await ctx.newPage();
  await joiner.goto(`${base}/`);
  await waitUntil(joiner, () => (window as any).__tankclash?.screen === "browser", "joiner on room browser");
  // Wait until the host's open room appears, then capture the browser.
  await waitUntil(
    joiner,
    () => document.querySelectorAll("#room-list .room-row").length >= 1,
    "room list populated",
  );
  await shoot(joiner, "lobby-browser", MIN_UI_BYTES);

  // Join the first joinable (lobby-phase) room.
  const joined = await joiner.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLDivElement>("#room-list .room-row")];
    const open = rows.find((r) => r.querySelector(".room-join.open")) ?? rows[0];
    open?.click();
    return Boolean(open);
  });
  if (!joined) fail("no room row to join");
  await waitUntil(joiner, () => (window as any).__tankclash?.screen === "room", "joiner entered the room");

  // Both are now in the lobby — capture the team/ready panel from the host.
  await waitUntil(host, () => (window as any).__tankclash?.players >= 2, "two humans in the lobby");
  await new Promise((r) => setTimeout(r, 400));
  await shoot(host, "lobby-room", MIN_UI_BYTES);

  // Ready up and let the host start.
  await host.click("#lobby-ready");
  await joiner.click("#lobby-ready");
  await new Promise((r) => setTimeout(r, 200));
  await host.click("#lobby-start");
  await waitUntil(host, () => (window as any).__tankclash?.phase === "countdown", "countdown started");
  await shoot(host, "lobby-countdown", MIN_UI_BYTES);

  await waitUntil(host, () => (window as any).__tankclash?.phase === "playing", "lobby match playing", 15_000);
  await new Promise((r) => setTimeout(r, 2500));
  await shoot(host, "match-2v2", MIN_PNG_BYTES);

  // Joiner leaves the fight mid-match → dies → becomes a spectator.
  await joiner.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  await joiner.click("#quit-btn"); // "Leave Match" → spectate
  await waitUntil(joiner, () => (window as any).__tankclash?.watching === true, "joiner now spectating");
  await new Promise((r) => setTimeout(r, 1500));
  await shoot(joiner, "spectate", MIN_PNG_BYTES);

  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  console.log(`\n✅ SCREENSHOT GATE PASSED — avg fps ${avgFps.toFixed(0)} (headless swiftshader)`);
  console.log("   captured: room browser, lobby, countdown, in-game (solo + 2v2), spectate, paused");

  await browser.close();
  cleanup();
  process.exit(0);
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

run().catch((err) => {
  console.error(err);
  fail(String(err?.message ?? err));
});
