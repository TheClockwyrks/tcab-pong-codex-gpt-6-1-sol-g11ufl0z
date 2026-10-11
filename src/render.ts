import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { items, menuItemRect } from "./game";
import type { State } from "./game";
const INK = "#ecf4ef",
  DIM = "#71858a",
  CYAN = "#6cf4d2",
  CORAL = "#ff8279",
  AMBER = "#edbe70";
export function render(s: State, { ctx: g }: RenderApi): void {
  const text = (
    copy: string,
    x: number,
    y: number,
    size = 16,
    color = INK,
    font = "monospace",
    align: CanvasTextAlign = "left",
  ) => {
    g.fillStyle = color;
    g.font = `${size}px ${font}`;
    g.textAlign = align;
    g.fillText(copy, x, y);
  };
  const line = (
    x: number,
    y: number,
    x1: number,
    y1: number,
    color: string,
  ) => {
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const bar = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x, y, w, h, Math.min(w, h) / 2);
    g.fill();
  };
  const live =
    s.screen === "playing" ||
    s.screen === "countdown" ||
    s.screen === "paused" ||
    s.screen === "matchover";
  g.save();
  // The fine court grid and perimeter give the ball's curve a stable reference.
  g.lineWidth = 1;
  for (let x = 80; x < C.FIELD_W; x += 80) line(x, 0, x, C.FIELD_H, "#102128");
  for (let y = 80; y < C.FIELD_H; y += 80) line(0, y, C.FIELD_W, y, "#102128");
  line(24, 24, C.FIELD_W - 24, 24, "#294047");
  line(24, C.FIELD_H - 24, C.FIELD_W - 24, C.FIELD_H - 24, "#294047");
  g.setLineDash([6, 16]);
  line(C.NET_X, 110, C.NET_X, C.FIELD_H - 80, "#30424a");
  g.setLineDash([]);
  g.globalAlpha = live ? 1 : 0.22;
  for (const o of s.obstacles) {
    g.save();
    g.translate(o.cx, o.cy);
    g.rotate(o.theta);
    g.shadowColor = AMBER;
    g.shadowBlur = 14;
    bar(-C.OBSTACLE_HW, -C.OBSTACLE_HH, C.OBSTACLE_W, C.OBSTACLE_H, AMBER);
    g.shadowBlur = 0;
    g.fillStyle = "#543e23";
    g.beginPath();
    g.arc(0, 0, 3, 0, 2 * Math.PI);
    g.fill();
    g.restore();
  }
  for (const [x, p, color] of [
    [C.P1_X0, s.paddles.left, CYAN],
    [C.P2_X0, s.paddles.right, CORAL],
  ] as const) {
    g.shadowBlur = 18;
    g.shadowColor = color;
    bar(x, p.cy - C.PADDLE_HALF, C.PADDLE_W, C.PADDLE_H, color);
    g.shadowBlur = 0;
  }
  if (s.ball) {
    const b = s.ball;
    for (let i = 1; i < b.trail.length; i++) {
      const a = b.trail[i - 1],
        p = b.trail[i];
      g.lineWidth = 2 + (6 * i) / b.trail.length;
      g.globalAlpha = (((live ? 1 : 0.22) * i) / b.trail.length) * 0.4;
      line(a.x, a.y, p.x, p.y, CYAN);
    }
    g.globalAlpha = live ? 1 : 0.22;
    g.shadowColor = INK;
    g.shadowBlur = 18;
    g.fillStyle = INK;
    g.beginPath();
    g.arc(b.x, b.y, C.BALL_R, 0, 2 * Math.PI);
    g.fill();
    g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
  g.lineWidth = 1;
  if (live) {
    text("01 / YOU", C.FIELD_CX - 125, 50, 12, CYAN, "monospace", "center");
    text(
      s.mode === "solo" ? "02 / MACHINE" : "02 / PLAYER",
      C.FIELD_CX + 125,
      50,
      12,
      CORAL,
      "monospace",
      "center",
    );
    text(
      String(s.score.p1).padStart(2, "0"),
      C.FIELD_CX - 125,
      105,
      48,
      CYAN,
      "monospace",
      "center",
    );
    text(
      String(s.score.p2).padStart(2, "0"),
      C.FIELD_CX + 125,
      105,
      48,
      CORAL,
      "monospace",
      "center",
    );
    text("CAROM / " + (s.mode === "solo" ? "SOLO" : "VERSUS"), 48, 52, 15, INK);
    text(`FIRST TO ${C.WIN_SCORE} · WIN BY ${C.WIN_LEAD}`, 48, 76, 11, DIM);
    text("W / S", 48, 680, 12, CYAN);
    text(
      s.mode === "solo" ? "ARROWS ALSO MOVE YOU" : "↑ / ↓",
      C.FIELD_W - 48,
      680,
      12,
      CORAL,
      "monospace",
      "right",
    );
    text(
      "P  PAUSE     M  " + (s.muted ? "SOUND OFF" : "SOUND ON"),
      C.FIELD_CX,
      680,
      12,
      DIM,
      "monospace",
      "center",
    );
    if (s.screen === "countdown") {
      text("READY", C.FIELD_CX, 300, 16, INK, "monospace", "center");
      g.strokeStyle = CYAN;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(
        C.FIELD_CX,
        C.FIELD_CY,
        30,
        -Math.PI / 2,
        -Math.PI / 2 +
          2 * Math.PI * (1 - (s.ball?.holdTimer ?? 0) / C.HOLD_TIME),
      );
      g.stroke();
      text(
        "SERVING " + (s.receiver === "left" ? "LEFT" : "RIGHT"),
        C.FIELD_CX,
        425,
        12,
        DIM,
        "monospace",
        "center",
      );
    }
  }
  if (items(s).length) {
    if (live) {
      g.fillStyle = "#091319e8";
      g.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    }
    // Left editorial panel / right menu: generous negative space, crisp typography.
    text("C / 01", 88, 86, 18, CYAN);
    text("A GAME OF ANGLES", 88, 144, 13, DIM);
    text(
      s.screen === "title"
        ? C.TITLE_TEXT
        : s.screen === "paused"
          ? "PAUSED"
          : s.screen === "howto"
            ? "THE ART"
            : "MATCH",
      82,
      270,
      s.screen === "title" ? 112 : 78,
      INK,
      "sans-serif",
    );
    text(
      s.screen === "howto"
        ? "OF CAROM"
        : s.screen === "matchover"
          ? "POINT"
          : "",
      82,
      353,
      78,
      INK,
      "sans-serif",
    );
    if (s.screen === "title") {
      text("Paddle. Curve. Outplay.", 88, 324, 25, CYAN, "sans-serif");
      text(
        "A paddle duel with a twist. Move into the",
        88,
        390,
        16,
        DIM,
        "sans-serif",
      );
      text(
        "hit to bend your shot. Bank off the moving",
        88,
        418,
        16,
        DIM,
        "sans-serif",
      );
      text(
        "obstacles. Find an angle they can't return.",
        88,
        446,
        16,
        DIM,
        "sans-serif",
      );
      line(88, 505, 530, 505, "#294047");
      text("01  SPIN IS YOUR ADVANTAGE", 88, 544, 12, AMBER);
      text("02  EVERY BANK OPENS A NEW ANGLE", 88, 574, 12, DIM);
      text("CHOOSE YOUR MATCH", 760, 274, 13, DIM);
    } else if (s.screen === "howto") {
      text("Make the next shot yours.", 88, 412, 24, CYAN, "sans-serif");
      text(
        "First to eleven. Keep a two-point lead.",
        88,
        450,
        17,
        DIM,
        "sans-serif",
      );
      const notes = [
        [
          "01 / MOVE",
          "W / S for left · ↑ / ↓ for right.",
          "Solo: either pair moves your paddle.",
        ],
        [
          "02 / CURVE",
          "Move your paddle at contact to add spin.",
          "Hit near an edge for a steeper angle.",
        ],
        [
          "03 / BANK",
          "The amber bars sway and rotate.",
          "Use their tilted faces to change direction.",
        ],
      ];
      notes.forEach((n, i) => {
        const y = 204 + i * 104;
        text(n[0], 760, y, 13, CYAN);
        text(n[1], 760, y + 30, 16, INK, "sans-serif");
        text(n[2], 760, y + 54, 15, DIM, "sans-serif");
      });
      text("P / ESC  pause     M  mute", 88, 510, 13, DIM);
    } else if (s.screen === "paused") {
      text("Take a breath. Find your angle.", 88, 330, 23, CYAN, "sans-serif");
      text("Your rally will be right here.", 88, 375, 17, DIM, "sans-serif");
      text("RALLY ON HOLD", 760, 274, 13, DIM);
    } else {
      text(
        s.winner === "left"
          ? "PLAYER ONE WINS"
          : s.mode === "solo"
            ? "MACHINE WINS"
            : "PLAYER TWO WINS",
        88,
        416,
        22,
        s.winner === "left" ? CYAN : CORAL,
        "sans-serif",
      );
      text(`${s.score.p1}  —  ${s.score.p2}`, 88, 482, 48, INK);
      text("ONE MORE ROUND?", 760, 274, 13, DIM);
    }
    items(s).forEach((item, i) => {
      const r = menuItemRect(s, i)!,
        selected = i === s.menuIndex;
      g.fillStyle = selected ? CYAN : "#12232a";
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, 4);
      g.fill();
      text(`0${i + 1}`, r.x + 20, r.y + 36, 13, selected ? "#24594c" : DIM);
      text(
        item,
        r.x + 62,
        r.y + 37,
        20,
        selected ? "#091319" : INK,
        "sans-serif",
      );
      if (selected)
        text(
          "↗",
          r.x + r.w - 25,
          r.y + 37,
          25,
          "#091319",
          "sans-serif",
          "right",
        );
    });
    if (s.screen === "title") {
      text("YOU vs MACHINE", 760, 552, 11, DIM);
      text("OR A FRIEND AT THE SAME KEYBOARD", 760, 576, 11, DIM);
    }
    line(88, 628, 1192, 628, "#294047");
    text("W / S OR ↑ / ↓  SELECT     ENTER  PLAY", 88, 667, 12, DIM);
    text(
      "M  " + (s.muted ? "SOUND OFF" : "SOUND ON"),
      1192,
      667,
      12,
      DIM,
      "monospace",
      "right",
    );
  }
  g.restore();
}
