import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { game, initial, debug, start, pose } from "./game";
import type { CaromState, CaromDebugApi } from "./game";
import * as C from "./constants";
const engines: Engine<CaromState, CaromDebugApi>[] = [];
afterEach(() => {
  engines.forEach((e) => e.destroy());
  engines.length = 0;
});
async function setup(step = 8) {
  const events = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    background: "#091319",
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    events.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const pointer = (type: string, x: number, y: number, id = 1) =>
    events.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  return { engine, key, pointer, canvas };
}
async function flight(step = 8) {
  const setupResult = await setup(step),
    e = setupResult.engine;
  e.apply((s) => debug.clearWorld(start(s, "versus")));
  e.apply((s) => debug.spawnBall(s));
  e.apply((s) => debug.setScreen(s, "playing"));
  e.apply((s) => debug.setBallHeld(s, false));
  return setupResult;
}
describe("Carom engine integration", () => {
  it("registers diagnostics and leaves title furniture frozen", async () => {
    const { engine: e } = await setup();
    const before = e.state;
    await e.advance(10);
    expect(e.state.simTime).toBeCloseTo(0.08);
    expect(e.state.ball).toEqual(before.ball);
    expect(e.diagnostics().length).toBeGreaterThanOrEqual(7);
    expect(debug.snapshot(e.state).version).toBe(C.CAROM_DEBUG_VERSION);
  });
  it("prioritizes navigation and remembers the confirmed title selection", async () => {
    const { engine: e, key } = await setup();
    key("KeyS");
    key("Enter");
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    expect(e.state.screen).toBe("title");
    key("Enter", "keyup");
    key("Enter");
    await e.advance(1);
    expect(e.state.mode).toBe("versus");
    expect(e.state.titleIndex).toBe(1);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("paused");
    const before = e.state;
    await e.advance(5);
    expect(e.state.ball).toEqual(before.ball);
    expect(e.state.obstacleClock).toBe(before.obstacleClock);
    key("Escape", "keyup");
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
  });
  it("serves on expiry without advancing the served ball", async () => {
    const { engine: e } = await setup(10);
    e.apply((s) => start(s));
    e.apply((s) => debug.setBallServeSign(s, -1));
    e.apply((s) => debug.setBallHoldTimer(s, 0.005));
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.ball?.x).toBe(C.FIELD_CX);
    expect(e.state.ball?.vy).toBeLessThan(0);
    expect(debug.snapshot(e.state).ball?.speed).toBeCloseTo(C.SERVE_SPEED);
  });
  it("integrates driven paddles and measures actual clamped velocity", async () => {
    const { engine: e } = await setup(10);
    e.apply((s) => start(s));
    e.apply((s) => debug.setPaddleDriven(s, "left", true));
    e.apply((s) => debug.setPaddleCy(s, "left", C.PADDLE_MAX_CY - 2));
    e.apply((s) => debug.setPaddleVy(s, "left", 500));
    await e.advance(1);
    expect(e.state.paddles.left.vy).toBeCloseTo(200);
    await e.advance(1);
    expect(e.state.paddles.left.vy).toBe(0);
    expect(e.state.paddles.left.drivenVy).toBe(500);
  });
  it("adds spin and accelerates on a paddle front hit", async () => {
    const { engine: e } = await flight();
    e.apply((s) =>
      debug.setBallPosition(s, C.P1_X1 + C.BALL_R + 1, C.FIELD_CY),
    );
    e.apply((s) => debug.setBallVelocity(s, -500, 0));
    e.apply((s) => debug.setPaddleDriven(s, "left", true));
    e.apply((s) => debug.setPaddleVy(s, "left", 100));
    await e.advance(1);
    expect(e.state.ball!.vx).toBeGreaterThan(0);
    expect(e.state.ball!.spin).toBeGreaterThan(80);
    expect(debug.snapshot(e.state).ball!.speed).toBeCloseTo(520);
  });
  it("reflects walls and paddle caps without changing speed", async () => {
    const { engine: e } = await flight();
    e.apply((s) => debug.setBallPosition(s, 300, C.BALL_R + 1));
    e.apply((s) => debug.setBallVelocity(s, 0, -500));
    await e.advance(1);
    expect(e.state.ball!.vy).toBe(500);
    e.apply((s) =>
      debug.setBallPosition(
        s,
        (C.P1_X0 + C.P1_X1) / 2,
        C.FIELD_CY - C.PADDLE_HALF - C.BALL_R - 1,
      ),
    );
    e.apply((s) => debug.setBallVelocity(s, 0, 500));
    await e.advance(1);
    expect(e.state.ball!.vy).toBe(-500);
  });
  it("reflects oriented obstacles and keeps their point symmetry", async () => {
    const { engine: e } = await flight();
    e.apply((s) => debug.spawnObstacle(s, 0));
    e.apply((s) => debug.setObstacleClock(s, 0.75));
    e.apply((s) => debug.setObstacleClockRunning(s, false));
    const o = e.state.obstacles[0],
      nx = Math.cos(o.theta),
      ny = Math.sin(o.theta);
    e.apply((s) =>
      debug.setBallPosition(
        s,
        o.cx + nx * (C.OBSTACLE_HW + C.BALL_R + 1),
        o.cy + ny * (C.OBSTACLE_HW + C.BALL_R + 1),
      ),
    );
    e.apply((s) => debug.setBallVelocity(s, -500 * nx, -500 * ny));
    await e.advance(1);
    expect(e.state.ball!.vx * nx + e.state.ball!.vy * ny).toBeGreaterThan(490);
    expect(debug.snapshot(e.state).ball!.speed).toBeCloseTo(500);
    expect(pose(0, 0.5).cy + pose(1, 0.5).cy).toBe(C.FIELD_H);
  });
  it("scores through play, requires a two-point lead, and parks after a point", async () => {
    const { engine: e } = await flight();
    e.apply((s) => debug.setScore(s, 10, 10));
    e.apply((s) => debug.setBallPosition(s, C.FIELD_W + C.BALL_R + 1, 100));
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.receiver).toBe("right");
    expect(e.state.ball!.held).toBe(true);
    e.apply((s) => debug.setScreen(s, "playing"));
    e.apply((s) => debug.setBallHeld(s, false));
    e.apply((s) => debug.setBallPosition(s, C.FIELD_W + C.BALL_R + 1, 100));
    await e.advance(1);
    expect(e.state.screen).toBe("matchover");
    expect(e.state.winner).toBe("left");
  });
  it("uses both edges in one menu region for pointer confirmation", async () => {
    const { engine: e, pointer } = await setup();
    const r = debug.menuItemRect(e.state, 2)!;
    pointer("pointerdown", r.x + 10, r.y + 10);
    await e.advance(1);
    pointer("pointerup", r.x + 10, r.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    const back = debug.menuItemRect(e.state, 0)!;
    pointer("pointerdown", back.x + 10, back.y + 10);
    pointer("pointerup", 0, 0);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
  });
  it("gates AI tracking and movement independently", async () => {
    const { engine: e } = await flight();
    e.apply((s) => debug.setMode(s, "solo"));
    e.apply((s) => debug.setBallPosition(s, 800, 100));
    e.apply((s) => debug.setBallVelocity(s, 200, 0));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(-C.AI_SPEED);
    e.apply((s) => debug.setAiMovement(s, false));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(0);
    e.apply((s) => debug.setAiMovement(s, true));
    e.apply((s) => debug.setAiTracking(s, false));
    e.apply((s) => debug.setPaddleCy(s, "right", 100));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(C.AI_SPEED);
  });
  it("poses immutably, reconciles idempotently and fails for absent entities", () => {
    const s = initial(true);
    expect(debug.setBallSpin(s, 77).ball!.spin).toBe(77);
    expect(s.ball!.spin).toBe(0);
    const empty = debug.clearWorld(s);
    expect(() => debug.setBallHeld(empty, true)).toThrow();
    expect(() => debug.spawnObstacle(s, 2)).toThrow();
    expect(debug.reconcile(debug.reconcile(s))).toEqual(debug.reconcile(s));
    expect(debug.reset(s).muted).toBe(true);
    expect(debug.menuItemRect({ ...s, screen: "playing" }, 0)).toBeNull();
  });
  it("agrees across small and large frame deltas on free spin flight", async () => {
    const results = [];
    for (const step of [2, 16]) {
      const { engine: e } = await flight(step);
      e.apply((s) => debug.setBallPosition(s, 300, 350));
      e.apply((s) => debug.setBallVelocity(s, 500, 0));
      e.apply((s) => debug.setBallSpin(s, 400));
      await e.advance(400 / step);
      results.push(debug.snapshot(e.state).ball!);
    }
    expect(Math.abs(results[0].speed - results[1].speed)).toBeLessThan(10);
    expect(Math.sign(results[0].vy)).toBe(Math.sign(results[1].vy));
    expect(results[0].spin).toBeCloseTo(results[1].spin, 5);
  });
  it("plays each collision cue once per frame and mirrors mute", async () => {
    const { engine: e, key } = await flight(16);
    const cues: { cue: string; gain: number }[] = [];
    e.events.on("cue:played", (event) => cues.push(event));
    key("KeyM");
    e.apply((s) => debug.setBallPosition(s, 300, C.BALL_R + 1));
    e.apply((s) => debug.setBallVelocity(s, 0, -500));
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    expect(cues).toHaveLength(1);
    expect(cues[0].cue).toBe(C.CUES.wallBounce);
    expect(cues[0].gain).toBe(0);
    e.apply((s) => debug.setMuted(s, false));
    await e.advance(1);
    expect(e.state.muted).toBe(false);
  });
  it("restarts and returns to a fully restored remembered title", async () => {
    const { engine: e, key } = await setup();
    e.apply((s) => debug.setTitleIndex(start(s, "versus"), 1));
    e.apply((s) => debug.setScreen(s, "paused"));
    e.apply((s) => debug.setMenuIndex(s, 1));
    e.apply((s) => debug.setScore(s, 5, 4));
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toEqual({ p1: 0, p2: 0 });
    key("Enter", "keyup");
    e.apply((s) => debug.setScreen(s, "paused"));
    e.apply((s) => debug.setMenuIndex(s, 2));
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    expect(e.state.mode).toBe("solo");
    expect(e.state.ai).toEqual({ tracking: true, movement: true });
  });
  it("prioritizes a keyboard confirm over a simultaneous pointer confirm", async () => {
    const { engine: e, key, pointer } = await setup();
    const r = debug.menuItemRect(e.state, 1)!;
    key("Enter");
    pointer("pointerdown", r.x + 10, r.y + 10);
    pointer("pointerup", r.x + 10, r.y + 10);
    await e.advance(1);
    expect(e.state.mode).toBe("solo");
    expect(e.state.screen).toBe("countdown");
  });
  it("keeps ball, paddle and obstacle poses independent", () => {
    let s = initial();
    s = debug.setResumeScreen(s, "countdown");
    s = debug.setWinner(s, "right");
    s = debug.setReceiver(s, "right");
    s = debug.setBallServeSign(s, -1);
    const before = s.ball!;
    s = debug.drawBallServeSign(s);
    expect(s.ball!.x).toBe(before.x);
    expect([-1, 1]).toContain(s.ball!.serveSign);
    expect(debug.snapshot(s).receiver).toBe("right");
    expect(s.winner).toBe("right");
    expect(s.resumeScreen).toBe("countdown");
    s = debug.setBallSpin(s, 200);
    s = debug.setBallVelocity(s, 3, 4);
    expect(debug.snapshot(s).ball!.speed).toBe(5);
    expect(s.ball!.spin).toBe(200);
  });
  it("agrees on paddle contacts, wall bounces and points across frame lengths", async () => {
    const outcomes = [];
    for (const step of [2, 16]) {
      const { engine: e } = await flight(step);
      const cues: string[] = [];
      e.events.on("cue:played", (event) => cues.push(event.cue));
      e.apply((s) => debug.setBallPosition(s, 150, 350));
      e.apply((s) => debug.setBallVelocity(s, -900, -350));
      let elapsed = 0;
      while (e.state.screen === "playing" && elapsed < 4) {
        await e.advance(1);
        elapsed += step / 1000;
      }
      outcomes.push({ score: e.state.score, cues, elapsed });
    }
    expect(outcomes[0].score).toEqual(outcomes[1].score);
    expect(outcomes[0].cues).toEqual(outcomes[1].cues);
    expect(
      Math.abs(outcomes[0].elapsed - outcomes[1].elapsed) / outcomes[0].elapsed,
    ).toBeLessThan(0.08);
  });
});
