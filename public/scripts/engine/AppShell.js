/*
 * AppShell — run several independent apps (whole games) behind one set of tabs.
 *
 * This is the layer above ModeManager: ModeManager switches modes *within* one
 * game (shared session/systems/juice); AppShell switches between *different*
 * games, each with its own GameSession — own game loop, managers, juice
 * settings, systems. They share only the canvas and the p5 draw loop. Only the
 * active app is ticked, so inactive apps are paused but keep their state.
 *
 * An app is a descriptor:
 *   {
 *     id, title,
 *     background,               // per-app background color
 *     build(gs),                // build the world (run once, lazily, on first show)
 *     onActivate(gs, shell),    // optional: each time it becomes active (mount panels…)
 *     onDeactivate(gs),         // optional: each time it stops being active (hide panels…)
 *   }
 *
 * Usage:
 *   const shell = new AppShell({ apps: [burst, orbit], tabs: '#app-tabs', initial: 'burst' });
 *
 * On switch it also toggles an `app-<id>` body class (for CSS-driven per-app UI)
 * and marks the active `data-app` tab.
 */

import makeSession from "./makeSession.js";
import bootSketch from "./bootSketch.js";

export default class AppShell {
  constructor(config = {}) {
    this.parent = config.parent || 'canvas';
    this.frameRate = config.frameRate || 60;
    this.bodyClasses = config.bodyClasses !== false;
    this.onChange = config.onChange || null;

    this.__apps = new Map();        // id -> descriptor
    this.__sessions = new Map();    // id -> GameSession (built lazily)
    this.__activeId = null;
    this.__tabs = null;
    this.__w = 0;
    this.__h = 0;
    this.__canvas = null;

    (config.apps || []).forEach((a) => this.define(a));

    // One shared canvas + loop; getActive() picks the app to run each frame.
    this.__p5 = bootSketch(() => this.active, {
      parent: this.parent,
      frameRate: this.frameRate,
      pointerGuard: config.pointerGuard,
      onSetup: (p, w, h, canvas) => {
        this.__w = w; this.__h = h; this.__canvas = canvas;
        // Push real dimensions onto any sessions already built.
        for (const s of this.__sessions.values()) this._applyDims(s);
      },
      onResize: (p, w, h) => {
        this.__w = w; this.__h = h;
        for (const s of this.__sessions.values()) this._applyDims(s);
      },
    });

    if (config.tabs) this.bindTabs(config.tabs);
    const first = config.initial || (config.apps && config.apps[0] && config.apps[0].id);
    if (first) this.set(first);
  }

  define(app) { this.__apps.set(app.id, app); return this; }

  get active() { return this.__activeId ? this.__sessions.get(this.__activeId) : null; }
  get activeId() { return this.__activeId; }
  session(id) { return this.__sessions.get(id) || null; }

  _applyDims(gs) { gs.canvasWidth = this.__w; gs.canvasHeight = this.__h; }

  _ensure(id) {
    if (this.__sessions.has(id)) return this.__sessions.get(id);
    const app = this.__apps.get(id);
    const gs = makeSession({
      background: app.background ?? 0,
      frameRate: this.frameRate,
      p5: this.__p5,
      width: this.__w,
      height: this.__h,
      build: app.build,
    });
    if (this.__canvas) gs.canvas = this.__canvas;
    this.__sessions.set(id, gs);
    return gs;
  }

  set(id) {
    if (!this.__apps.has(id) || id === this.__activeId) return;
    const prev = this.__activeId;
    if (prev) {
      const cur = this.__apps.get(prev);
      if (cur.onDeactivate) cur.onDeactivate(this.__sessions.get(prev));
    }

    this.__activeId = id;
    const gs = this._ensure(id);
    this._applyDims(gs);

    if (this.bodyClasses) {
      for (const aid of this.__apps.keys()) {
        document.body.classList.toggle('app-' + aid, aid === id);
      }
    }
    if (this.__tabs) {
      this.__tabs.querySelectorAll('[data-app]').forEach((b) =>
        b.classList.toggle('active', b.dataset.app === id));
    }

    const app = this.__apps.get(id);
    if (app.onActivate) app.onActivate(gs, this);
    if (this.onChange) this.onChange(id, prev);
  }

  bindTabs(selectorOrEl) {
    const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!el) return this;
    this.__tabs = el;
    el.querySelectorAll('[data-app]').forEach((b) =>
      b.addEventListener('click', () => this.set(b.dataset.app)));
    if (this.__activeId) {
      el.querySelectorAll('[data-app]').forEach((b) =>
        b.classList.toggle('active', b.dataset.app === this.__activeId));
    }
    return this;
  }
}
