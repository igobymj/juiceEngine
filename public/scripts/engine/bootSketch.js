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
  const { parent = 'canvas', frameRate = 60, pointerGuard, onSetup, onResize, maxBackingDim = 1600 } = config;

  const sketch = function (p) {
    const dims = () => {
      const el = document.getElementById(parent);
      return [el.clientWidth, el.clientHeight];
    };

    // Pixel density that keeps the canvas backing store's longest side <= maxBackingDim.
    // A large animated 2D canvas judders because the GPU/compositor can't present that
    // many pixels each frame — a cost the JS-side FPS can't see (rAF still fires at
    // 16.7ms). Capping the backing store bounds that cost so the frame rate holds no
    // matter how big the window gets. Density is a fractional pixelDensity, so ALL
    // coordinates (drawing, mouse, UI hit-tests) stay in CSS pixels — only the render
    // resolution drops, and CSS upscales the smaller buffer to fill the window. Never
    // above 1 (avoids the 4x Retina buffer). Trade-off: marginally softer on a big window.
    const densityFor = (w, h) => Math.min(1, maxBackingDim / Math.max(w, h, 1));

    p.setup = function () {
      const [w, h] = dims();
      p.pixelDensity(densityFor(w, h));
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
    p.keyPressed = function (e) { const gs = getActive(); if (gs) gs.inputManager.keyInput(p.key, e && e.code); };

    p.windowResized = function () {
      const [w, h] = dims();
      p.pixelDensity(densityFor(w, h));   // re-cap the backing store for the new size
      p.resizeCanvas(w, h);
      if (onResize) onResize(p, w, h);
    };
  };

  return new p5(sketch, parent);
}
