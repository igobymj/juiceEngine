/*
 * bootSketch — the shared p5 lifecycle, driven by whatever session is active.
 *
 * One canvas, one draw loop. Each frame it asks getActive() for the session to
 * run and routes input to it. A single-game app returns the same session every
 * time (see createGame); a multi-app wrapper returns the active app's session
 * (see AppShell). Inactive sessions simply aren't ticked — that's the pause.
 *
 * onSetup/onResize receive (p, width, height, canvas) so the caller can record
 * the p5 instance, canvas element, and dimensions onto its session(s).
 */
export default function bootSketch(getActive, config = {}) {
  const { parent = 'canvas', frameRate = 60, pointerGuard, onSetup, onResize } = config;

  const sketch = function (p) {
    const dims = () => {
      const el = document.getElementById(parent);
      return [el.clientWidth, el.clientHeight];
    };

    p.setup = function () {
      const [w, h] = dims();
      const canvas = p.createCanvas(w, h);
      canvas.parent(parent);
      p.frameRate(frameRate);
      if (onSetup) onSetup(p, w, h, canvas);
    };

    p.draw = function () {
      const gs = getActive();
      if (!gs) { p.background(0); return; }
      gs.timeManager.update();
      gs.gameLoop.update();
      p.background(p.color(gs.backgroundColor));
      gs.gameLoop.render();
      if (gs.flashColor != 0) {
        p.fill(gs.flashColor);
        p.rect(0, 0, gs.canvasWidth, gs.canvasHeight);
      }
    };

    p.mousePressed = function () {
      const gs = getActive();
      if (!gs) return;
      if (pointerGuard && pointerGuard(p.mouseX, p.mouseY, gs)) return;
      gs.inputManager.mousePressed(p.mouseX, p.mouseY);
    };
    p.mouseDragged = function () { const gs = getActive(); if (gs) gs.inputManager.mouseDragged(p.mouseX, p.mouseY); };
    p.mouseReleased = function () { const gs = getActive(); if (gs) gs.inputManager.mouseReleased(); };
    p.keyPressed = function () { const gs = getActive(); if (gs) gs.inputManager.keyInput(p.key); };

    p.windowResized = function () {
      const [w, h] = dims();
      p.resizeCanvas(w, h);
      if (onResize) onResize(p, w, h);
    };
  };

  return new p5(sketch, parent);
}
