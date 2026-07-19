/*
 * createGame — one-call bootstrap for a single-game app.
 *
 * Thin wrapper over makeSession (build the world) + bootSketch (own the canvas
 * and drive that one session every frame). For running several independent
 * games behind tabs, use AppShell instead.
 *
 * Config:
 *   parent, background, frameRate
 *   build(gs)          wire content: register systems, seed juice, add handlers
 *   onSetup(gs, p)     after the canvas exists
 *   onResize(gs, p)    after a window resize
 *   pointerGuard(x,y)  return true to drop a pointer event (e.g. over a panel)
 *   autoInput, autoJuice
 */

import makeSession from "./makeSession.js";
import bootSketch from "./bootSketch.js";

export default function createGame(config = {}) {
  const {
    parent = 'canvas',
    background = 0,
    frameRate = 60,
    build,
    onSetup,
    onResize,
    pointerGuard,
    autoInput = true,
    autoJuice = true,
  } = config;

  const gs = makeSession({ background, frameRate, autoInput, autoJuice, build });

  bootSketch(() => gs, {
    parent,
    frameRate,
    pointerGuard,
    onSetup: (p, w, h, canvas) => {
      gs.p5 = p;
      gs.canvas = canvas;
      gs.canvasWidth = w;
      gs.canvasHeight = h;
      if (onSetup) onSetup(gs, p);
    },
    onResize: (p, w, h) => {
      gs.canvasWidth = w;
      gs.canvasHeight = h;
      if (onResize) onResize(gs, p);
    },
  });

  return gs;
}
