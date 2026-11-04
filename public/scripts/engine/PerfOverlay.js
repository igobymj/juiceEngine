/*
 * PerfOverlay — a lightweight, toggleable on-screen FPS / frame-time / live-count
 * readout for spotting frame drops.
 *
 * It's a fixed-position DOM element, so it adds nothing to the canvas draw cost, and
 * it's registered as a render system so it samples once per frame. Frame time is an
 * exponential moving average of p5's deltaTime (with a per-window peak to catch
 * hitches); the text repaints ~10x/sec to avoid layout thrash. Costs ~nothing while
 * hidden (one boolean check per frame).
 *
 *   const perf = new PerfOverlay(gs, () => ({ objects: rtd.objects.length }));
 *   gs.gameLoop.addRenderSystem('perf', perf, 999);   // not in any mode → always on
 *   // toggle from a key handler: perf.toggle();
 */

export default class PerfOverlay {
  constructor(gameSession, counts = null) {
    this.gs = gameSession;
    this.counts = counts;         // optional () => ({ label: value, ... })
    this.el = null;
    this.visible = false;
    this.__ms = 1000 / 60;        // smoothed sim frame time (ms, from p5.deltaTime)
    this.__peak = 0;              // worst sim frame time in the current repaint window
    this.__lastText = 0;
    // True display refresh, measured by a raw rAF loop independent of p5's frameRate
    // throttle. If this reads well above the sim fps, a capped frameRate is juddering
    // on a high-refresh display (the sim can't land frames on even refresh boundaries).
    this.__rafMs = 1000 / 60;
    this.__rafLast = 0;
    this.__rafOn = false;
  }

  _startRefreshMeter() {
    if (this.__rafOn) return;
    this.__rafOn = true;
    const tick = (now) => {
      if (this.__rafLast) {
        const d = now - this.__rafLast;
        if (d > 0.1 && d < 100) this.__rafMs += (d - this.__rafMs) * 0.05;
      }
      this.__rafLast = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible) this._ensureEl();
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  _ensureEl() {
    if (this.el) return;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'bottom:8px', 'left:8px', 'z-index:99999', 'pointer-events:none',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace', 'color:#5f5',
      'background:rgba(0,0,0,0.62)', 'padding:6px 9px', 'border-radius:5px',
      'white-space:pre', 'letter-spacing:0.3px',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;
    this._startRefreshMeter();
  }

  render() {
    if (!this.visible) return;
    // Smooth frame time every frame; track the window's worst frame to surface hitches.
    const dt = (this.gs.p5 && this.gs.p5.deltaTime) || 1000 / 60;
    this.__ms += (dt - this.__ms) * 0.1;
    if (dt > this.__peak) this.__peak = dt;

    const now = performance.now();
    if (now - this.__lastText < 100) return;   // repaint ~10x/sec
    this.__lastText = now;

    const fps = this.__ms > 0 ? 1000 / this.__ms : 0;
    const hz = this.__rafMs > 0 ? 1000 / this.__rafMs : 0;
    const lines = [
      `${fps.toFixed(0).padStart(3)} fps sim    ${hz.toFixed(0)} Hz display`,
      `avg ${this.__ms.toFixed(1)} ms   peak ${this.__peak.toFixed(1)} ms`,
    ];
    this.__peak = 0;
    if (this.counts) {
      let c = {};
      try { c = this.counts() || {}; } catch (e) { /* counts source not ready */ }
      for (const k in c) lines.push(`${k.padEnd(9)} ${c[k]}`);
    }
    if (this.el) this.el.textContent = lines.join('\n');
  }
}
