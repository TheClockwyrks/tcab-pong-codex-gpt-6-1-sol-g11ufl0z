import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { render } from "./render";
import { advance } from "./simulation";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly theta: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];
  readonly obstacleClock: number;
  readonly obstacleClockRunning: boolean;

  readonly simTime: number;
  readonly muted: boolean;
}

export const BACKGROUND = "#091319";
export type State = DeepReadonly<CaromState>;
export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const items = (s: State): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "matchover"
        ? C.MATCHOVER_ITEMS
        : s.screen === "howto"
          ? ["BACK TO MENU"]
          : [];
export function menuItemRect(s: State, index: number): MenuRect | null {
  if (index < 0 || index >= items(s).length) return null;
  return {
    x: 760,
    y: (s.screen === "howto" ? 552 : 320) + index * 72,
    w: 380,
    h: 58,
  };
}
export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export const park = (): BallState => ({
  x: C.FIELD_CX,
  y: C.FIELD_CY,
  vx: 0,
  vy: 0,
  spin: 0,
  held: true,
  holdTimer: C.HOLD_TIME,
  serveSign: drawSign(),
  trail: [],
});
export function pose(index: number, t: number): ObstacleState {
  const base = C.OBSTACLE_CENTERS[index];
  if (!base) throw new Error("Unknown obstacle index");
  return {
    index,
    cx: base.x,
    cy:
      base.y +
      (index === 0 ? 1 : -1) *
        C.OBSTACLE_SWAY_AMP *
        Math.sin((2 * Math.PI * t) / C.OBSTACLE_SWAY_PERIOD),
    theta: C.OBSTACLE_SPIN_RATE * t,
  };
}
export function initial(muted = false): CaromState {
  const paddle = (): PaddleState => ({
    cy: C.FIELD_CY,
    vy: 0,
    driven: false,
    drivenVy: 0,
  });
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: paddle(), right: paddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: park(),
    obstacles: [pose(0, 0), pose(1, 0)],
    obstacleClock: 0,
    obstacleClockRunning: true,
    simTime: 0,
    muted,
  };
}
export function start(s: State, mode = s.mode): CaromState {
  return {
    ...s,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: park(),
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
    obstacleClock: 0,
    obstacleClockRunning: true,
    obstacles: s.obstacles.map((o) => pose(o.index, 0)),
  };
}
export function title(s: State): CaromState {
  return {
    ...initial(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
const ballPatch = (s: State, patch: Partial<BallState>): CaromState => {
  if (!s.ball) throw new Error("No ball present");
  return { ...s, ball: { ...s.ball, ...patch } };
};
const paddlePatch = (
  s: State,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState => ({
  ...s,
  paddles: { ...s.paddles, [side]: { ...s.paddles[side], ...patch } },
});
export interface CaromDebugApi {
  readonly version: number;
  clearWorld(s: State): CaromState;
  spawnBall(s: State): CaromState;
  spawnObstacle(s: State, index: number): CaromState;
  reset(s: State): CaromState;
  reconcile(s: State): CaromState;
  setScreen(s: State, screen: Screen): CaromState;
  setMode(s: State, mode: Mode): CaromState;
  setMenuIndex(s: State, index: number): CaromState;
  setTitleIndex(s: State, index: number): CaromState;
  setResumeScreen(s: State, screen: "countdown" | "playing"): CaromState;
  setScore(s: State, p1: number, p2: number): CaromState;
  setWinner(s: State, side: Side | null): CaromState;
  setReceiver(s: State, side: Side): CaromState;
  setPaddleCy(s: State, side: Side, cy: number): CaromState;
  setPaddleVy(s: State, side: Side, vy: number): CaromState;
  setPaddleDriven(s: State, side: Side, driven: boolean): CaromState;
  setBallPosition(s: State, x: number, y: number): CaromState;
  setBallVelocity(s: State, vx: number, vy: number): CaromState;
  setBallSpin(s: State, spin: number): CaromState;
  setBallHeld(s: State, held: boolean): CaromState;
  setBallHoldTimer(s: State, seconds: number): CaromState;
  setBallServeSign(s: State, sign: 1 | -1): CaromState;
  drawBallServeSign(s: State): CaromState;
  setAiTracking(s: State, enabled: boolean): CaromState;
  setAiMovement(s: State, enabled: boolean): CaromState;
  setMuted(s: State, muted: boolean): CaromState;
  setObstacleClock(s: State, t: number): CaromState;
  setObstacleClockRunning(s: State, running: boolean): CaromState;
  snapshot(
    s: State,
  ): State & { version: number; ball: (BallState & { speed: number }) | null };
  menuItemRect(s: State, index: number): MenuRect | null;
}
export const debug: CaromDebugApi = {
  version: C.CAROM_DEBUG_VERSION,
  clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
  spawnBall: (s) => ({ ...s, ball: park() }),
  spawnObstacle: (s, index) => ({
    ...s,
    obstacles: [
      ...s.obstacles.filter((o) => o.index !== index),
      pose(index, s.obstacleClock),
    ].sort((a, b) => a.index - b.index),
  }),
  reset: (s) => initial(s.muted),
  reconcile: (s) => ({
    ...s,
    obstacles: s.obstacles.map((o) => pose(o.index, s.obstacleClock)),
  }),
  setScreen: (s, screen) => ({ ...s, screen }),
  setMode: (s, mode) => ({ ...s, mode }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setTitleIndex: (s, titleIndex) => ({ ...s, titleIndex }),
  setResumeScreen: (s, resumeScreen) => ({ ...s, resumeScreen }),
  setScore: (s, p1, p2) => ({ ...s, score: { p1, p2 } }),
  setWinner: (s, winner) => ({ ...s, winner }),
  setReceiver: (s, receiver) => ({ ...s, receiver }),
  setPaddleCy: (s, side, cy) => paddlePatch(s, side, { cy }),
  setPaddleVy: (s, side, drivenVy) => paddlePatch(s, side, { drivenVy }),
  setPaddleDriven: (s, side, driven) => paddlePatch(s, side, { driven }),
  setBallPosition: (s, x, y) => ballPatch(s, { x, y }),
  setBallVelocity: (s, vx, vy) => ballPatch(s, { vx, vy }),
  setBallSpin: (s, spin) => ballPatch(s, { spin }),
  setBallHeld: (s, held) => ballPatch(s, { held }),
  setBallHoldTimer: (s, holdTimer) => ballPatch(s, { holdTimer }),
  setBallServeSign: (s, serveSign) => ballPatch(s, { serveSign }),
  drawBallServeSign: (s) => ballPatch(s, { serveSign: drawSign() }),
  setAiTracking: (s, tracking) => ({ ...s, ai: { ...s.ai, tracking } }),
  setAiMovement: (s, movement) => ({ ...s, ai: { ...s.ai, movement } }),
  setMuted: (s, muted) => ({ ...s, muted }),
  setObstacleClock: (s, obstacleClock) => ({
    ...s,
    obstacleClock,
    obstacles: s.obstacles.map((o) => pose(o.index, obstacleClock)),
  }),
  setObstacleClockRunning: (s, obstacleClockRunning) => ({
    ...s,
    obstacleClockRunning,
  }),
  snapshot: (s) => ({
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    resumeScreen: s.resumeScreen,
    score: { ...s.score },
    winner: s.winner,
    muted: s.muted,
    paddles: structuredClone(s.paddles),
    ai: { ...s.ai },
    receiver: s.receiver,
    obstacles: structuredClone(s.obstacles),
    obstacleClock: s.obstacleClock,
    obstacleClockRunning: s.obstacleClockRunning,
    simTime: s.simTime,
    version: C.CAROM_DEBUG_VERSION,
    ball: s.ball
      ? { ...structuredClone(s.ball), speed: Math.hypot(s.ball.vx, s.ball.vy) }
      : null,
  }),
  menuItemRect,
};
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        freq: [620, 300, 880, 180][i],
        freqTo: [320, 180, 500, 600][i],
        durationMs: 75 + i * 20,
        gain: 0.15,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("score", (s) => `${s.score.p1} : ${s.score.p2}`);
    api.diagnostics.register("ball", (s) =>
      s.ball ? `${s.ball.x.toFixed(1)}, ${s.ball.y.toFixed(1)}` : "absent",
    );
    api.diagnostics.register("velocity", (s) =>
      s.ball ? `${s.ball.vx.toFixed(1)}, ${s.ball.vy.toFixed(1)}` : "absent",
    );
    api.diagnostics.register("speed / spin", (s) =>
      s.ball
        ? `${Math.hypot(s.ball.vx, s.ball.vy).toFixed(1)} / ${s.ball.spin.toFixed(1)}`
        : "absent",
    );
    for (const side of ["left", "right"] as const)
      api.diagnostics.register(
        side,
        (s) =>
          `${s.paddles[side].cy.toFixed(1)} / ${s.paddles[side].vy.toFixed(1)}`,
      );
    return [initial(), debug];
  },
  update: advance,
  render,
};
