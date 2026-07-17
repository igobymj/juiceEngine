/*
 * ModeManager — application flow over the engine's systems.
 *
 * A "mode" (screen/scene: play, editor, tune…) is a named set of systems that
 * should be live. Switching modes enables that set and parks the rest, toggles
 * a `mode-<name>` body class (for CSS-driven panels), and updates a tab bar.
 *
 * This is policy on top of the loop's mechanism: it never owns the loop, it
 * just flips each system's `enabled` (which the loop honours). Systems not
 * mentioned in *any* mode are never touched — that's how core systems like
 * input and juice stay always-on.
 *
 * GameSession stays mode-agnostic; the app owns the ModeManager.
 *
 * Usage:
 *   const modes = new ModeManager(gs);
 *   modes.define('play', { systems: [hud] });
 *   modes.define('tune', { systems: [tuneHud], enter(gs){}, exit(gs){} });
 *   modes.bindTabs('#mode-tabs');
 *   modes.set('play');            // call after all define()s
 */

function setSystemEnabled(sys, on) {
  if (typeof sys.setEnabled === 'function') sys.setEnabled(on);
  else sys.enabled = on;
}

export default class ModeManager {
  constructor(gameSession, options = {}) {
    this.gameSession = gameSession;
    this.bodyClasses = options.bodyClasses !== false;
    this.onChange = options.onChange || null;
    this.__modes = new Map();   // name -> { systems:Set, enter, exit }
    this.__all = new Set();     // union of every mode's systems
    this.__current = null;
    this.__tabs = null;
  }

  define(name, { systems = [], enter, exit } = {}) {
    const set = new Set(systems);
    this.__modes.set(name, { systems: set, enter, exit });
    for (const s of set) {
      this.__all.add(s);
      // If a mode is defined after we've already entered one, park any of its
      // systems that aren't part of the current mode.
      if (this.__current && !this.__modes.get(this.__current).systems.has(s)) {
        setSystemEnabled(s, false);
      }
    }
    return this;
  }

  get current() { return this.__current; }

  set(name) {
    if (!this.__modes.has(name) || name === this.__current) return;
    const prev = this.__current;
    if (prev) { const pd = this.__modes.get(prev); if (pd.exit) pd.exit(this.gameSession); }
    this.__current = name;

    const active = this.__modes.get(name).systems;
    for (const s of this.__all) setSystemEnabled(s, active.has(s));

    if (this.bodyClasses) {
      for (const m of this.__modes.keys()) {
        document.body.classList.toggle('mode-' + m, m === name);
      }
    }
    if (this.__tabs) {
      this.__tabs.querySelectorAll('[data-mode]').forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === name));
    }

    const nd = this.__modes.get(name);
    if (nd.enter) nd.enter(this.gameSession);
    if (this.onChange) this.onChange(name, prev);
  }

  // Wire a container of <button data-mode="..."> tabs.
  bindTabs(selectorOrEl) {
    const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!el) return this;
    this.__tabs = el;
    el.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.set(b.dataset.mode)));
    if (this.__current) {
      el.querySelectorAll('[data-mode]').forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === this.__current));
    }
    return this;
  }
}
