# Carom

Carom is a browser paddle duel about spin and bank shots. Move your paddle at contact to curve the ball around two swaying, rotating obstacles. Play against the machine or share a keyboard with a friend. First to eleven wins, with a two-point lead.

Everything is drawn and synthesized in code using the Simple 2D engine. The game runs locally in your browser, with no backend or runtime downloads.

## Run

Install dependencies with `npm ci`, then start development with `npm run dev`.

Build the static site with `npm run build`. Serve the resulting `dist/` directory at the root of any static host, or check it locally with `npm run preview`.

## Controls

| Control | Action |
| --- | --- |
| W / S | Left paddle |
| Up / Down arrows | Right paddle; in Solo, also the left paddle |
| W / S or arrow keys | Select a menu item |
| Enter / Space | Confirm |
| P / Escape | Pause or resume |
| Escape | Return from instructions or match results |
| M | Toggle sound |

Menus also support mouse and touch. On touch devices, the engine supplies paddle sliders and menu controls. Move your paddle as the ball arrives to add spin; an edge hit sends it away at a steeper angle.

## Verify

Run `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`. The tests run the real engine with an in-process canvas and counted clock frames, covering collisions, serving, scoring, AI, input, and state transitions.

The game exposes its automation surface through `engine.debug` for callers that construct an engine; it is not installed on the page. The source specifications are in `specs/`, and engine documentation is in `engine/`. Player-facing screenshots and a draw-command replay are in `showcase/`.
