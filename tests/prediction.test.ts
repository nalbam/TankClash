import { describe, expect, it } from "vitest";
import { FIXED_DT, GRID_W, VEHICLE } from "../shared/constants";
import { stepVehicle, type VehicleBody } from "../shared/physics";
import { TerrainGrid } from "../shared/terrain";
import type { PlayerInput } from "../shared/types";
import { LocalPredictor } from "../client/net/predictor";
import type { PlayerView } from "../client/net/colyseusClient";

function flatTerrain(groundY = 20): TerrainGrid {
  const g = new TerrainGrid();
  const rows = Math.round(groundY / 0.5);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) g.cells[cy * GRID_W + cx] = 1;
  }
  return g;
}

function makeBody(x: number, y: number): VehicleBody {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: false,
    dashCooldown: 0,
    input: { seq: 0, left: false, right: false, jump: false, dash: false, aimAngle: 0, charging: false },
  };
}

function input(seq: number, partial: Partial<PlayerInput>): PlayerInput {
  return { seq, left: false, right: false, jump: false, dash: false, aimAngle: 0, charging: false, ...partial };
}

function viewFromBody(body: VehicleBody, lastSeq: number): PlayerView {
  return {
    id: "local",
    name: "L",
    team: "blue",
    isBot: false,
    alive: true,
    health: 100,
    kills: 0,
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    lastSeq,
    aimAngle: 0,
    charging: false,
    charge: 0,
    cooldown: 0,
    weapon: "cannon",
    shieldTime: 0,
    burnTime: 0,
  };
}

describe("LocalPredictor reconciliation", () => {
  it("matches the authoritative server simulation after partial-ack replay", () => {
    const terrain = flatTerrain(20);
    const groundY = 20 + VEHICLE.HALF_H + 0.05;

    // The "server" body that authoritatively processes every input.
    const server = makeBody(80, groundY);
    // The predictor on the client.
    const predictor = new LocalPredictor();
    predictor.reset(viewFromBody(server, 0));

    const inputs = [
      input(1, { right: true }),
      input(2, { right: true }),
      input(3, { right: true }),
      input(4, { right: true, jump: true }),
      input(5, { right: true }),
      input(6, { right: true }),
    ];

    // Client predicts all 6 locally.
    for (const inp of inputs) predictor.applyInput(inp, terrain);

    // Server has only processed up to seq 3 so far.
    for (let i = 0; i < 3; i++) {
      server.input = inputs[i];
      stepVehicle(server, terrain, FIXED_DT);
    }
    predictor.reconcile(viewFromBody(server, 3), terrain);

    // After reconcile the predictor should equal server(3) + replay(4,5,6).
    const expected = makeBody(server.x, server.y);
    expected.vx = server.vx;
    expected.vy = server.vy;
    expected.grounded = server.grounded;
    for (let i = 3; i < 6; i++) {
      expected.input = inputs[i];
      stepVehicle(expected, terrain, FIXED_DT);
    }

    expect(predictor.body.x).toBeCloseTo(expected.x, 6);
    expect(predictor.body.y).toBeCloseTo(expected.y, 6);
    expect(predictor.body.vx).toBeCloseTo(expected.vx, 6);
  });

  it("converges to the server position once all inputs are acknowledged", () => {
    const terrain = flatTerrain(20);
    const groundY = 20 + VEHICLE.HALF_H + 0.05;
    const server = makeBody(80, groundY);
    const predictor = new LocalPredictor();
    predictor.reset(viewFromBody(server, 0));

    for (let seq = 1; seq <= 5; seq++) {
      const inp = input(seq, { right: true });
      predictor.applyInput(inp, terrain);
      server.input = inp;
      stepVehicle(server, terrain, FIXED_DT);
    }
    // Server acknowledges everything.
    predictor.reconcile(viewFromBody(server, 5), terrain);

    expect(predictor.body.x).toBeCloseTo(server.x, 6);
    expect(predictor.body.y).toBeCloseTo(server.y, 6);
  });

  it("hard-resets when divergence exceeds the snap threshold (teleport/respawn)", () => {
    const terrain = flatTerrain(20);
    const groundY = 20 + VEHICLE.HALF_H + 0.05;
    const predictor = new LocalPredictor();
    predictor.reset(viewFromBody(makeBody(80, groundY), 0));

    predictor.applyInput(input(1, { right: true }), terrain);
    // Server reports a wildly different position (e.g. respawn across the map).
    const respawn = viewFromBody(makeBody(180, groundY), 1);
    predictor.reconcile(respawn, terrain);

    expect(predictor.body.x).toBeCloseTo(180, 6);
  });
});
