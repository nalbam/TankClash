import { describe, expect, it } from "vitest";
import { stickToAim, stickToMove } from "../client/input/input";

describe("gamepad stick mapping", () => {
  it("maps left stick X to left/right past the deadzone", () => {
    expect(stickToMove(-1)).toEqual({ left: true, right: false });
    expect(stickToMove(1)).toEqual({ left: false, right: true });
    expect(stickToMove(0)).toEqual({ left: false, right: false });
    expect(stickToMove(0.1)).toEqual({ left: false, right: false }); // inside deadzone
  });

  it("honors the d-pad as well as the stick", () => {
    expect(stickToMove(0, true, false).left).toBe(true);
    expect(stickToMove(0, false, true).right).toBe(true);
  });

  it("aims with the right stick, world-y up", () => {
    // Pushing right → angle 0.
    const right = stickToAim(1, 0);
    expect(right.active).toBe(true);
    expect(right.angle).toBeCloseTo(0, 5);
    // Pushing up (stick y negative) → angle +PI/2 in world space.
    const up = stickToAim(0, -1);
    expect(up.active).toBe(true);
    expect(up.angle).toBeCloseTo(Math.PI / 2, 5);
    // Pushing down → -PI/2.
    expect(stickToAim(0, 1).angle).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("ignores the right stick inside the deadzone", () => {
    expect(stickToAim(0, 0).active).toBe(false);
    expect(stickToAim(0.1, 0.1).active).toBe(false);
  });
});
