/*
 * makeSession — create a fully-wired GameSession without booting p5.
 *
 * This is the "one game world" builder: a GameSession with its own managers,
 * juice settings, and game loop, the near-universal input+juice systems
 * registered, and your build() run against it. It does NOT create a canvas —
 * that's bootSketch's job — so several sessions can share one canvas (see
 * AppShell) or a single session can own one (see createGame).
 *
 * Because the engine's managers are no longer singletons, each call yields a
 * fully independent world.
 */

import GameSession from "./GameSession.js";

export default function makeSession(config = {}) {
  const {
    background = 0,
    frameRate = 60,
    autoInput = true,
    autoJuice = true,
    build,
    p5 = null,          // shared p5 instance (multi-app) or null (createGame sets it later)
    width = 0,
    height = 0,
  } = config;

  const gs = new GameSession();
  gs.backgroundColor = background;
  if (p5) gs.p5 = p5;
  gs.canvasWidth = width;
  gs.canvasHeight = height;

  gs.timeManager.timeScale = 1;
  gs.timeManager.frameRate = frameRate;
  gs.timeManager.start();

  if (autoInput) gs.gameLoop.addUpdateSystem('input', gs.inputManager, 0);
  if (autoJuice) {
    gs.gameLoop.addUpdateSystem('juice', gs.juiceEventManager, 200);
    gs.gameLoop.addRenderSystem('juice', gs.juiceEventManager, 200);
  }

  if (build) build(gs);
  return gs;
}
