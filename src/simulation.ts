import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { items, menuItemRect, park, pose, start, title } from "./game";
import type { BallState, CaromState, PaddleState, State } from "./game";
export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));
function move(p: PaddleState, vy: number, dt: number): PaddleState {
  const raw = p.cy + vy * dt,
    cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : vy };
}
function confirm(s: State): CaromState {
  if (s.screen === "title") {
    const next = { ...s, titleIndex: s.menuIndex };
    return s.menuIndex === 2
      ? { ...next, screen: "howto", menuIndex: 0 }
      : start(next, s.menuIndex === 0 ? "solo" : "versus");
  }
  if (s.screen === "howto") return title(s);
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...s, screen: s.resumeScreen }
      : s.menuIndex === 1
        ? start(s)
        : title(s);
  return s.menuIndex === 0 ? start(s) : title(s);
}
// A contact's start is retained as derived UI bookkeeping, outside the match model.
interface ContactState extends CaromState {
  readonly contactStarts?: Readonly<
    Record<number, { index: number; screen: string }>
  >;
}
function input(s: State, api: UpdateApi): CaromState {
  const edges = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  let next: CaromState = { ...s };
  if (edges.mute) api.audio.setMuted(!s.muted);
  else if (api.audio.muted() !== s.muted) api.audio.setMuted(s.muted);
  next = { ...next, muted: api.audio.muted() };
  const samples = api.input.pointerSamples();
  api.input.pointerContacts();
  if (s.screen === "playing" || s.screen === "countdown")
    return edges.pause
      ? { ...next, screen: "paused", resumeScreen: s.screen, menuIndex: 0 }
      : next;
  if (s.screen === "paused" && (edges.pause || edges.back))
    return { ...next, screen: s.resumeScreen };
  if ((s.screen === "howto" || s.screen === "matchover") && edges.back)
    return title(next);
  const count = items(s).length;
  const up = edges["p1-up"] || edges["p2-up"],
    down = edges["p1-down"] || edges["p2-down"];
  let keyboardConfirm = false;
  if (up) next = { ...next, menuIndex: (s.menuIndex + count - 1) % count };
  else if (down) next = { ...next, menuIndex: (s.menuIndex + 1) % count };
  else if (edges.confirm) {
    next = confirm(next);
    keyboardConfirm = true;
  }
  const starts = { ...(s as ContactState).contactStarts };
  let pointerConfirm = false;
  for (const sample of samples) {
    if (sample.device !== "touch" && !sample.primary) continue;
    const index =
      Array.from({ length: count }, (_, i) => i).find((i) => {
        const r = menuItemRect(s, i)!;
        return (
          sample.x >= r.x &&
          sample.x <= r.x + r.w &&
          sample.y >= r.y &&
          sample.y <= r.y + r.h
        );
      }) ?? -1;
    if (index >= 0 && !keyboardConfirm) next = { ...next, menuIndex: index };
    if (sample.type === "down") starts[sample.id] = { index, screen: s.screen };
    if (sample.type === "up") {
      if (
        index >= 0 &&
        starts[sample.id]?.index === index &&
        starts[sample.id]?.screen === s.screen
      )
        pointerConfirm = true;
      delete starts[sample.id];
    }
  }
  if (pointerConfirm && !keyboardConfirm) next = confirm(next);
  return { ...next, contactStarts: starts } as ContactState;
}
type MovingBall = { -readonly [K in keyof BallState]: BallState[K] };
function paddleCollision(
  b: MovingBall,
  p: PaddleState,
  left: boolean,
  cues: Set<string>,
) {
  const x0 = left ? C.P1_X0 : C.P2_X0,
    x1 = left ? C.P1_X1 : C.P2_X1,
    y0 = p.cy - C.PADDLE_HALF,
    y1 = p.cy + C.PADDLE_HALF;
  if (
    b.x <= x0 - C.BALL_R ||
    b.x >= x1 + C.BALL_R ||
    b.y <= y0 - C.BALL_R ||
    b.y >= y1 + C.BALL_R
  )
    return;
  const depths = [
    b.x - (x0 - C.BALL_R),
    x1 + C.BALL_R - b.x,
    b.y - (y0 - C.BALL_R),
    y1 + C.BALL_R - b.y,
  ];
  const face = depths.indexOf(Math.min(...depths));
  if (face < 2) {
    const into = face === 0 ? b.vx > 0 : b.vx < 0;
    b.x = face === 0 ? x0 - C.BALL_R : x1 + C.BALL_R;
    if (!into) return;
    const angle =
      clamp((b.y - p.cy) / C.PADDLE_HALF, -1, 1) * C.MAX_BOUNCE_ANGLE;
    const speed = Math.min(Math.hypot(b.vx, b.vy) * C.SPEED_MULT, C.SPEED_CAP);
    b.vx = (left ? 1 : -1) * speed * Math.cos(angle);
    b.vy = speed * Math.sin(angle);
    b.spin = clamp(
      b.spin + p.vy * C.SPIN_FROM_PADDLE,
      -C.SPIN_CLAMP,
      C.SPIN_CLAMP,
    );
    b.x = left ? C.P1_X1 + C.BALL_R : C.P2_X0 - C.BALL_R;
    cues.add(C.CUES.paddleHit);
  } else {
    b.y = face === 2 ? y0 - C.BALL_R : y1 + C.BALL_R;
    if ((face === 2 && b.vy > 0) || (face === 3 && b.vy < 0)) {
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
  }
}
export function fly(
  ball: BallState,
  s: State,
  dt: number,
  cues: Set<string>,
): BallState {
  const b: MovingBall = { ...ball };
  const n = Math.max(
      1,
      Math.ceil((Math.hypot(b.vx, b.vy) * dt) / C.MAX_SUBSTEP),
    ),
    h = dt / n;
  for (let step = 0; step < n; step++) {
    const speed = Math.hypot(b.vx, b.vy),
      angle = speed > 0 ? (b.spin / speed) * h : 0,
      c = Math.cos(angle),
      sn = Math.sin(angle);
    const vx = b.vx * c - b.vy * sn;
    b.vy = b.vx * sn + b.vy * c;
    b.vx = vx;
    b.spin *= Math.pow(0.5, h / C.SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y - C.BALL_R < 0 && b.vy < 0) {
      b.y = C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    } else if (b.y + C.BALL_R > C.FIELD_H && b.vy > 0) {
      b.y = C.FIELD_H - C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
    paddleCollision(b, s.paddles.left, true, cues);
    paddleCollision(b, s.paddles.right, false, cues);
    for (const o of s.obstacles) {
      const co = Math.cos(o.theta),
        si = Math.sin(o.theta),
        dx = b.x - o.cx,
        dy = b.y - o.cy;
      const lx = dx * co + dy * si,
        ly = -dx * si + dy * co,
        qx = clamp(lx, -C.OBSTACLE_HW, C.OBSTACLE_HW),
        qy = clamp(ly, -C.OBSTACLE_HH, C.OBSTACLE_HH);
      const ex = lx - qx,
        ey = ly - qy,
        d = Math.hypot(ex, ey);
      if (d >= C.BALL_R) continue;
      let nx: number, ny: number, penetration: number;
      if (d > 0) {
        nx = ex / d;
        ny = ey / d;
        penetration = C.BALL_R - d;
      } else {
        const px = C.OBSTACLE_HW - Math.abs(lx),
          py = C.OBSTACLE_HH - Math.abs(ly);
        nx = px <= py ? (lx >= 0 ? 1 : -1) : 0;
        ny = px <= py ? 0 : ly >= 0 ? 1 : -1;
        penetration = C.BALL_R + Math.min(px, py);
      }
      const wx = nx * co - ny * si,
        wy = nx * si + ny * co,
        dot = b.vx * wx + b.vy * wy;
      if (dot < 0) {
        b.vx -= 2 * dot * wx;
        b.vy -= 2 * dot * wy;
        cues.add(C.CUES.obstacleBounce);
      }
      b.x += wx * penetration;
      b.y += wy * penetration;
    }
  }
  return b;
}
export function advance(state: State, api: UpdateApi, dt: number): CaromState {
  let s = input(state, api);
  s = { ...s, simTime: state.simTime + dt };
  if (s.screen !== "playing" && s.screen !== "countdown") return s;
  const axis = (up: string, down: string) =>
    Number(api.input.value(down) > 0) - Number(api.input.value(up) > 0);
  const leftAxis =
    s.mode === "solo"
      ? Number(
          api.input.value("p1-down") > 0 || api.input.value("p2-down") > 0,
        ) - Number(api.input.value("p1-up") > 0 || api.input.value("p2-up") > 0)
      : axis("p1-up", "p1-down");
  let rightVy = axis("p2-up", "p2-down") * C.PADDLE_SPEED;
  if (s.mode === "solo") {
    const defending =
      s.ai.tracking &&
      s.screen === "playing" &&
      s.ball !== null &&
      s.ball.vx > 0;
    const target = defending
      ? s.ball!.y - s.ball!.vy * C.AI_REACT
      : C.AI_HOME_Y;
    const diff = target - s.paddles.right.cy,
      deadzone = defending ? C.AI_DEADZONE : C.AI_HOME_DEADZONE;
    rightVy =
      s.ai.movement && Math.abs(diff) > deadzone && dt > 0
        ? Math.sign(diff) * Math.min(C.AI_SPEED, Math.abs(diff) / dt)
        : 0;
  }
  s = {
    ...s,
    paddles: {
      left: move(
        s.paddles.left,
        s.paddles.left.driven
          ? s.paddles.left.drivenVy
          : leftAxis * C.PADDLE_SPEED,
        dt,
      ),
      right: move(
        s.paddles.right,
        s.paddles.right.driven ? s.paddles.right.drivenVy : rightVy,
        dt,
      ),
    },
  };
  const cues = new Set<string>();
  let ball = s.ball;
  if (ball) {
    if (ball.held) {
      const holdTimer = Math.max(0, ball.holdTimer - dt);
      ball = { ...ball, x: C.FIELD_CX, y: C.FIELD_CY, holdTimer };
      if (holdTimer <= 0) {
        ball = {
          ...ball,
          held: false,
          vx:
            (s.receiver === "left" ? -1 : 1) *
            C.SERVE_SPEED *
            Math.cos(C.SERVE_ANGLE),
          vy: ball.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
          trail: [],
        };
        s = { ...s, screen: "playing" };
      }
    } else if (s.screen === "playing") ball = fly(ball, s, dt, cues);
    ball = {
      ...ball,
      trail: [
        ...ball.trail.filter((p) => s.simTime - p.t <= C.TRAIL_TIME),
        { x: ball.x, y: ball.y, t: s.simTime },
      ],
    };
    if (ball.x - C.BALL_R > C.FIELD_W || ball.x + C.BALL_R < 0) {
      const left = ball.x > C.FIELD_W,
        score = {
          p1: s.score.p1 + Number(left),
          p2: s.score.p2 + Number(!left),
        };
      cues.add(C.CUES.score);
      const win =
        (score.p1 >= C.WIN_SCORE && score.p1 - score.p2 >= C.WIN_LEAD) ||
        (score.p2 >= C.WIN_SCORE && score.p2 - score.p1 >= C.WIN_LEAD);
      s = {
        ...s,
        score,
        screen: win ? "matchover" : "countdown",
        winner: win ? (left ? "left" : "right") : null,
        menuIndex: win ? 0 : s.menuIndex,
        receiver: win ? s.receiver : left ? "right" : "left",
      };
      if (!win) ball = park();
    }
  }
  const obstacleClock = s.obstacleClock + (s.obstacleClockRunning ? dt : 0);
  s = {
    ...s,
    ball,
    obstacleClock,
    obstacles: s.obstacles.map((o) => pose(o.index, obstacleClock)),
  };
  for (const cue of cues) api.audio.play(cue);
  return s;
}
