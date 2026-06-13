/**
 * Verification gate 4: headless client capture.
 *
 * Boots the real server + Vite dev client, joins a room (a bot fills the
 * opposing slot), and captures screenshots at fixed times. Fails when the
 * canvas renders blank or the client never reaches a playing match.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const SERVER_PORT = 2567;
const CLIENT_PORT = 8087;
const SHOT_TIMES_S = [2, 10, 30];
const MIN_PNG_BYTES = 30_000; // a blank/black frame compresses far below this

const children: ChildProcess[] = [];

function fail(message: string): never {
  console.error(`\n❌ SCREENSHOT GATE FAILED: ${message}`);
  cleanup();
  process.exit(1);
}

function cleanup(): void {
  for (const child of children) {
    if (child.pid && !child.killed) {
      // Kill the whole process group so tsx/vite child node processes die too.
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
    detached: true, // new process group → cleanup can signal the whole tree
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
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`${url} did not become reachable within ${timeoutMs}ms`);
}

async function run(): Promise<void> {
  mkdirSync("screenshots", { recursive: true });

  console.log("starting server…");
  start("npx", ["tsx", "server/index.ts"], { PORT: String(SERVER_PORT) });
  await waitForHttp(`http://localhost:${SERVER_PORT}/api/rooms`, 20_000);

  console.log("starting client (vite)…");
  start("npx", ["vite", "--port", String(CLIENT_PORT), "--strictPort"]);
  await waitForHttp(`http://localhost:${CLIENT_PORT}/`, 20_000);

  console.log("launching headless chromium…");
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (err) => console.error("[page error]", err.message));

  await page.goto(`http://localhost:${CLIENT_PORT}/?name=Screenshot`);

  await page
    .waitForFunction(() => (window as any).__tankclash?.connected === true, undefined, { timeout: 15_000 })
    .catch(() => fail("client never connected to the server"));
  await page
    .waitForFunction(() => (window as any).__tankclash?.players >= 2, undefined, { timeout: 15_000 })
    .catch(() => fail("bot opponent never joined (players < 2)"));
  await page
    .waitForFunction(() => (window as any).__tankclash?.phase === "playing", undefined, { timeout: 15_000 })
    .catch(() => fail("match never reached the playing phase"));

  console.log("match is live — capturing…");
  const t0 = Date.now();
  const fpsSamples: number[] = [];

  for (const t of SHOT_TIMES_S) {
    const waitMs = t * 1000 - (Date.now() - t0);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    const flags = await page.evaluate(() => (window as any).__tankclash);
    fpsSamples.push(flags.fps);

    const file = path.join("screenshots", `match-t${t}s.png`);
    await page.screenshot({ path: file });
    const bytes = statSync(file).size;
    console.log(`  t=${t}s → ${file} (${(bytes / 1024).toFixed(0)} KB, fps=${flags.fps}, players=${flags.players}, phase=${flags.phase})`);

    if (bytes < MIN_PNG_BYTES) {
      fail(`${file} is only ${bytes} bytes — canvas is likely blank/black`);
    }
    if (!flags.connected) fail(`connection dropped by t=${t}s`);
  }

  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  console.log(`\n✅ SCREENSHOT GATE PASSED — avg fps ${avgFps.toFixed(0)} (headless swiftshader)`);

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
