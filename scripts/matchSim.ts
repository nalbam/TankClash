/**
 * Verification gate 3: headless bot-vs-bot match simulation.
 *
 * Runs the authoritative GameSim with two bots (no networking, no rendering)
 * and asserts the core gameplay loop is sound. Exits non-zero on any failure.
 */
import { performance } from "node:perf_hooks";
import { FIXED_DT } from "../shared/constants";
import { GameSim } from "../server/GameSim";
import { BotController } from "../server/bots/BotController";

const MATCHES_REQUIRED = 3;
const MAX_SIM_SECONDS_PER_MATCH = 240; // sudden death guarantees end well before this
const AVG_TICK_BUDGET_MS = 5;
const MAX_TICK_BUDGET_MS = 33;

interface MatchResult {
  winner: string;
  durationS: number;
  craters: number;
  shotsFired: number;
  kills: number;
}

function fail(message: string): never {
  console.error(`\n❌ MATCH SIM FAILED: ${message}`);
  process.exit(1);
}

function assertFinite(sim: GameSim): void {
  sim.state.players.forEach((p, id) => {
    for (const [key, v] of Object.entries({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, health: p.health, charge: p.charge })) {
      if (!Number.isFinite(v)) fail(`player ${id} has non-finite ${key}=${v}`);
    }
  });
  sim.state.projectiles.forEach((proj, id) => {
    for (const [key, v] of Object.entries({ x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy })) {
      if (!Number.isFinite(v)) fail(`projectile ${id} has non-finite ${key}=${v}`);
    }
  });
  if (!Number.isFinite(sim.state.wind)) fail(`wind is non-finite: ${sim.state.wind}`);
}

function run(): void {
  const seed = 20260613;
  const sim = new GameSim(seed);
  const bots = [new BotController("bot:a", seed ^ 0xa), new BotController("bot:b", seed ^ 0xb)];
  sim.addPlayer("bot:a", "BOT Alpha", true);
  sim.addPlayer("bot:b", "BOT Bravo", true);

  const results: MatchResult[] = [];
  const tickTimes: number[] = [];
  let shotsFired = 0;
  let kills = 0;
  let cratersThisRound = 0;
  let prevPhase = sim.state.phase as string;
  let simSecondsThisMatch = 0;
  let pathBlockedObserved = false;
  let prevSolid = sim.terrain.solidCount();

  const maxTicks = Math.ceil((MAX_SIM_SECONDS_PER_MATCH * (MATCHES_REQUIRED + 1)) / FIXED_DT);

  for (let tick = 0; tick < maxTicks && results.length < MATCHES_REQUIRED; tick++) {
    for (const bot of bots) {
      sim.setInput(bot.id, bot.update(sim, FIXED_DT));
    }

    const t0 = performance.now();
    sim.tick(FIXED_DT);
    tickTimes.push(performance.now() - t0);

    const events = sim.drainEvents();
    shotsFired += events.fired.length;
    kills += events.kills.length;
    cratersThisRound += events.craters.length;
    if (events.craters.length > 0 && sim.terrain.solidCount() < prevSolid) {
      pathBlockedObserved = true; // terrain destruction verifiably changed the world
    }
    prevSolid = sim.terrain.solidCount();

    if (tick % 30 === 0) assertFinite(sim);

    if (sim.state.phase === "playing") simSecondsThisMatch += FIXED_DT;

    if (sim.state.phase === "ended" && prevPhase === "playing") {
      results.push({
        winner: sim.state.winnerTeam || "draw",
        durationS: Math.round(sim.state.roundTime),
        craters: cratersThisRound,
        shotsFired,
        kills,
      });
      cratersThisRound = 0;
      simSecondsThisMatch = 0;
    }
    prevPhase = sim.state.phase;

    if (simSecondsThisMatch > MAX_SIM_SECONDS_PER_MATCH) {
      fail(`match ${results.length + 1} did not end within ${MAX_SIM_SECONDS_PER_MATCH}s of simulated time`);
    }
  }

  if (results.length < MATCHES_REQUIRED) {
    fail(`only ${results.length}/${MATCHES_REQUIRED} matches completed`);
  }

  const avgTick = tickTimes.reduce((a, b) => a + b, 0) / tickTimes.length;
  const maxTick = Math.max(...tickTimes);
  const totalCraters = results.reduce((a, r) => a + r.craters, 0);

  if (shotsFired === 0) fail("bots never fired");
  if (totalCraters === 0) fail("no terrain destruction occurred");
  if (kills === 0) fail("no kills occurred across all matches");
  if (!pathBlockedObserved) fail("terrain destruction never changed the solid cell count");
  if (avgTick > AVG_TICK_BUDGET_MS) fail(`average tick ${avgTick.toFixed(3)}ms exceeds ${AVG_TICK_BUDGET_MS}ms budget`);
  if (maxTick > MAX_TICK_BUDGET_MS) fail(`max tick ${maxTick.toFixed(3)}ms exceeds ${MAX_TICK_BUDGET_MS}ms budget`);

  console.log("✅ MATCH SIM PASSED");
  console.log(`   matches: ${results.length}`);
  results.forEach((r, i) =>
    console.log(`   match ${i + 1}: winner=${r.winner} duration=${r.durationS}s craters=${r.craters}`),
  );
  console.log(`   total shots fired: ${shotsFired}, kills: ${kills}`);
  console.log(`   tick time: avg=${avgTick.toFixed(3)}ms max=${maxTick.toFixed(3)}ms (budget ${AVG_TICK_BUDGET_MS}/${MAX_TICK_BUDGET_MS}ms)`);
}

run();
