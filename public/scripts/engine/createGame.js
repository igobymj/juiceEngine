/*
 * createGame — one-call engine bootstrap.
 *
 * Builds a GameSession, auto-registers the near-universal systems (input +
 * juice), runs your `build(gameSession)` to wire up game content, then starts
 * the p5 sketch (canvas sizing, the draw loop, and input dispatch). Returns the
 * GameSession so the caller can keep wiring (mount the juice editor, load saved
 * settings, etc.).
 *
 * This is the only boilerplate a new project would otherwise copy by hand.
 *
 * Config:
 *   parent        DOM id the canvas mounts into (default 'canvas')
 *   background    p5 background color (default 0)
 *   frameRate     target fps (default 60)
 *   build(gs)     wire content: register systems, seed juice, add handlers
 *   onSetup(gs,p) after the canvas exists (e.g. p.imageMode)
 *   onResize(gs,p)after a window resize
 *   pointerGuard(x,y)  return true to drop a pointer event (e.g. over a panel)
 *   autoInput     register the input manager at priority 0 (default true)
 *   autoJuice     register the juice manager at priority 200 (default true)
 */

import GameSession from "./GameSession.js";

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

  const gameSession = new GameSession();
  gameSession.backgroundColor = background;

  // Near-universal systems. Input runs first so held-key/pointer state is fresh
  // for consumers; juice runs last so a shake translate lands after everything
  // and rendered effects layer on top.
  if (autoInput) gameSession.gameLoop.addUpdateSystem('input', gameSession.inputManager, 0);
  if (autoJuice) {
    gameSession.gameLoop.addUpdateSystem('juice', gameSession.juiceEventManager, 200);
    gameSession.gameLoop.addRenderSystem('juice', gameSession.juiceEventManager, 200);
  }

  // Game content wiring, with the session available.
  if (build) build(gameSession);

  const sketch = function (p) {
    const sizeToParent = () => {
      const el = document.getElementById(parent);
      gameSession.canvasWidth = el.clientWidth;
      gameSession.canvasHeight = el.clientHeight;
    };

    p.setup = function () {
      sizeToParent();
      const canvas = p.createCanvas(gameSession.canvasWidth, gameSession.canvasHeight);
      canvas.parent(parent);
      gameSession.canvas = canvas;

      gameSession.timeManager.timeScale = 1;
      gameSession.timeManager.frameRate = frameRate;
      gameSession.timeManager.start();
      p.frameRate(frameRate);

      if (onSetup) onSetup(gameSession, p);
    };

    p.draw = function () {
      gameSession.timeManager.update();
      gameSession.gameLoop.update();

      p.background(p.color(gameSession.backgroundColor));
      gameSession.gameLoop.render();

      if (gameSession.flashColor != 0) {
        p.fill(gameSession.flashColor);
        p.rect(0, 0, gameSession.canvasWidth, gameSession.canvasHeight);
      }
    };

    p.mousePressed = function () {
      if (pointerGuard && pointerGuard(p.mouseX, p.mouseY)) return;
      gameSession.inputManager.mousePressed(p.mouseX, p.mouseY);
    };
    p.mouseDragged = function () { gameSession.inputManager.mouseDragged(p.mouseX, p.mouseY); };
    p.mouseReleased = function () { gameSession.inputManager.mouseReleased(); };
    p.keyPressed = function () { gameSession.inputManager.keyInput(p.key); };

    p.windowResized = function () {
      sizeToParent();
      p.resizeCanvas(gameSession.canvasWidth, gameSession.canvasHeight);
      if (onResize) onResize(gameSession, p);
    };
  };

  // p5 is a global from the <script> tag.
  gameSession.p5 = new p5(sketch, parent);
  return gameSession;
}
