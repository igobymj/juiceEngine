/*
 * PulseObject — a rhythm element for RTD: it pulses on the beat and plays a
 * sound at the moment of each pulse.
 *
 * Three visual kinds share the exact same beat/pulse/edit behaviour:
 *   'circle'    — a filled circle (the kick-circle).
 *   'ship'      — imported SVG artwork (a set of VectorGameObjects, from the SVG
 *                 import pathway) that scales as one about its centre.
 *   'metronome' — a filled circle like the kick-circle, but shown only as a beat
 *                 reference in the juice editor (RtdManager hides it in game play);
 *                 it mirrors the ship's default parameters.
 * Because all three are just PulseObjects, the RTD editor tunes any one the same
 * way. It carries its own editable "type" parameters (radius, color, tempo, how
 * big the pulse is, how fast it relaxes, which sound). Timing runs off the
 * unscaled realTimeSinceStartup clock so the beat stays steady.
 */

export default class PulseObject {
  constructor(gameSession, opts = {}) {
    this.gameSession = gameSession;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;

    this.id = opts.id ?? null;                     // stable instance id, assigned by the manager
    this.name = opts.name ?? null;                 // unique display name, assigned/uniquified by the manager
    this.isPrototype = opts.isPrototype ?? false;  // a template other objects are created from
    this.prototypeId = opts.prototypeId ?? null;   // id of the prototype this was cloned from (for live sync)
    // Inherited-property keys this instance overrides: it keeps its own value for
    // these instead of pulling them from its prototype each frame (see
    // RtdManager.INHERITED / syncInstancesFromPrototypes). Lets instances diverge —
    // e.g. per-instance volume in a mix. A map of { key: true }.
    this.overrides = { ...(opts.overrides || {}) };

    // 'circle' (default kick-circle), 'ship' (imported SVG vector shapes), 'metronome'
    // (a circle shown only in the editor — see RtdManager), 'drumKick' (a circle synth
    // drum) or 'downbeatGun' (a rectangle). Ship and metronome share the ship defaults.
    this.kind = opts.kind ?? 'circle';
    const shipLike = this.kind === 'ship' || this.kind === 'metronome';
    this.label = opts.label ?? (this.kind === 'ship' ? 'spaceship' : this.kind === 'metronome' ? 'metronome' : this.kind === 'drumKick' ? 'drum kick' : this.kind === 'downbeatGun' ? 'downbeat gun' : 'kick-circle');
    this.shapes = opts.shapes ?? null;   // VectorGameObject[] — required for kind 'ship'
    this.svg = opts.svg ?? null;         // source path for a 'ship', so it can be re-imported on load
    this.rotation = opts.rotation ?? 0;  // radians; a transform children inherit
    // Child objects that inherit this object's full transform (position, rotation,
    // scale/pulse). Each is { shapes: VectorGameObject[] } in this object's local
    // frame — e.g. the ship's exhaust flame. Rebuilt with the parent, not persisted.
    this.children = opts.children ?? [];

    // --- editable type parameters ---
    // For a ship, radius is the "size": radius === SHIP_REF_RADIUS renders the
    // artwork at its imported size, and it drives the hit test + selection ring.
    // A metronome takes the ship's defaults but uses radius as a plain circle radius.
    this.radius = opts.radius ?? (shipLike ? PulseObject.SHIP_REF_RADIUS : 60);
    this.color = opts.color ?? (shipLike ? '#cfc7e6' : this.kind === 'drumKick' ? '#e6a15c' : this.kind === 'downbeatGun' ? '#7bd88b' : '#8b7bd8');
    // A downbeatGun is an arbitrary quadrilateral: four corner vertices as offsets from
    // the object's (x,y), each independently draggable by its handle. Defaults to a
    // rectangle (and migrates an older width/height gun to rect verts). Per-object like
    // position — not inherited; other kinds ignore this.
    this.verts = (opts.verts && opts.verts.length === 4)
      ? opts.verts.map((v) => ({ x: v.x, y: v.y }))
      : PulseObject.rectVerts(opts.width ?? 120, opts.height ?? 60);
    this.bpm = opts.bpm ?? 100;              // pulse tempo
    this.pulseScale = opts.pulseScale ?? 1.6; // scale reached at the moment of a beat
    this.relax = opts.relax ?? 0.16;          // ease-back per frame toward rest (0..1)
    this.sound = opts.sound ?? 'kick';        // registered sound name to play on beat
    this.volume = opts.volume ?? -6;          // per-object playback level (dB)
    this.muted = opts.muted ?? false;         // when true, pulses visually but plays no sound
    // Subdivision: how many times this object fires per master beat. 1 = on each
    // beat, 2 = eighths, 3 = triplets, 0.5 = every 2 beats. The object's interval is
    // the master interval divided by this, so every object stays a rational multiple
    // of the metronome and locks to the shared grid by construction.
    this.division = opts.division ?? 1;
    // Phase offset as a signed fraction of the object's own (subdivided) interval
    // (-0.5..0.5): negative anticipates the beat (fires early), positive lags it
    // (fires late), ±0.5 is maximally off-beat — all while staying grid-locked. Held
    // as a fraction, not ms, so it keeps its meaning across tempo changes.
    this.phaseOffset = opts.phaseOffset ?? 0;

    // --- runtime state ---
    this.__scale = 1;
    this.selected = false;
    // Beat clocks start locked to the grid so the first pulse lands on the next grid
    // beat, not an off-grid one at creation/load. __lastVisualBeat drives the (frame-
    // accurate) visual pulse; __scheduledThrough is how far ahead the audio has been
    // scheduled on the sample-accurate audio clock (see update / _scheduleAudio).
    const t0 = this.gameSession.timeManager.realTimeSinceStartup;
    this.__lastVisualBeat = this._beatAt(t0);
    this.__scheduledThrough = t0;
  }

  // Beat interval in ms from this object's own bpm. Only the master metronome uses
  // it (RtdManager publishes it as the grid's masterInterval); synced objects derive
  // their interval from the grid instead — see _beatAt.
  get interval() { return 60000 / Math.max(1, this.bpm); }

  // The shared beat grid published by RtdManager: { epoch, masterInterval }. The
  // master metronome drives masterInterval (its bpm) and epoch (its phaseOffset, the
  // grid's manual phase alignment). Falls back to a 100bpm grid on phase 0 if no
  // manager is wired yet.
  _grid() {
    const g = this.gameSession.rtdManager && this.gameSession.rtdManager.beatGrid;
    return g || { epoch: 0, masterInterval: 600 };
  }

  // The most recent grid beat at or before time t. The object's interval is the
  // master interval divided by its subdivision, and phaseOffset shifts it within
  // that interval — so every object lands on a common grid, guaranteeing lock.
  // The master metronome defines the grid's phase (its phaseOffset already drives
  // grid.epoch), so it sits on the downbeat with no additional personal offset.
  _beatAt(t) {
    const grid = this._grid();
    const interval = grid.masterInterval / Math.max(0.01, this.division);
    const off = this.kind === 'metronome' ? 0 : this.phaseOffset;
    const anchor = grid.epoch + off * interval;
    return anchor + Math.floor((t - anchor) / interval) * interval;
  }

  update() {
    const t = this.gameSession.timeManager.realTimeSinceStartup;

    // Audio: schedule any beats in the lookahead window at their exact audio-clock
    // time, so the sound is sample-accurate instead of quantised to the frame it's
    // detected on (which added up to ~one frame of jitter).
    this._scheduleAudio(t);

    // Visual: pulse the scale on the frame a beat is reached. A sub-frame visual lag
    // behind the (sample-accurate) sound is imperceptible, so this stays frame-driven.
    // Deriving the beat from the grid each frame keeps same-tempo objects locked no
    // matter when each was made, and collapses a long gap (backgrounded tab) to one
    // pulse instead of a burst.
    const beat = this._beatAt(t);
    if (beat > this.__lastVisualBeat) {
      this.__lastVisualBeat = beat;
      this.__scale = this.pulseScale;
    }
    // Ease the scale back toward its rest size of 1.
    this.__scale += (1 - this.__scale) * this.relax;
  }

  // Pre-schedule every grid beat that falls within the lookahead window at its exact
  // audio-clock time. __scheduledThrough is a realTimeSinceStartup watermark of how
  // far ahead we've scheduled, so beats are enqueued exactly once. A stalled frame
  // (e.g. a backgrounded tab) is collapsed to "now", never a catch-up burst.
  _scheduleAudio(t) {
    const grid = this._grid();
    const interval = grid.masterInterval / Math.max(0.01, this.division);
    const off = this.kind === 'metronome' ? 0 : this.phaseOffset;
    const anchor = grid.epoch + off * interval;
    const horizon = t + PulseObject.LOOKAHEAD_MS;
    const from = Math.max(this.__scheduledThrough, t);   // never schedule past beats
    // First grid beat strictly after `from`.
    let beat = anchor + Math.ceil((from - anchor) / interval) * interval;
    if (beat <= from) beat += interval;

    const audible = !this.muted && this.sound && this.sound !== 'none';
    const snd = audible && this.gameSession.soundManager.getSound(this.sound);
    const now = window.Tone ? Tone.now() : 0;
    while (beat <= horizon) {
      // Translate the grid time (ms, realTimeSinceStartup) into an audio-clock time.
      if (snd && typeof snd.play === 'function') snd.play({ volume: this.volume, at: now + (beat - t) / 1000 });
      beat += interval;
    }
    this.__scheduledThrough = horizon;
  }

  render() {
    if (this.kind === 'ship') this.renderShip();
    else if (this.kind === 'downbeatGun') this.renderQuad();
    else this.renderCircle();
    this.renderSelection();
  }

  renderCircle() {
    const p = this.gameSession.p5;
    const d = this.radius * 2 * this.__scale;
    p.push();
    p.noStroke();
    p.fill(this.color);
    p.circle(this.x, this.y, d);
    p.pop();
  }

  // A filled quadrilateral through the four corner verts (offsets from x,y), pulsing
  // about (x,y) like the other kinds. Its shape is edited via the corner handles.
  renderQuad() {
    const p = this.gameSession.p5;
    const sc = this.__scale;
    p.push();
    p.noStroke();
    p.fill(this.color);
    p.beginShape();
    for (const v of this.verts) p.vertex(this.x + v.x * sc, this.y + v.y * sc);
    p.endShape(p.CLOSE);
    p.pop();
  }

  // The four rest-size (unscaled) corner points of a downbeatGun, in world space.
  corners() {
    return this.verts.map((v) => ({ x: this.x + v.x, y: this.y + v.y }));
  }

  // Index of the corner handle under (x,y) for this (selected) downbeatGun, or -1.
  cornerHandleAt(x, y) {
    if (this.kind !== 'downbeatGun' || !this.selected) return -1;
    const r = PulseObject.HANDLE_HIT;
    const cs = this.corners();
    for (let i = 0; i < cs.length; i++) {
      if (Math.abs(x - cs[i].x) <= r && Math.abs(y - cs[i].y) <= r) return i;
    }
    return -1;
  }

  // Drive the imported ship shapes as one: they share the ship's position and a
  // single scale, so pulsing the scale zooms the whole ship about its centre.
  // radius scales the artwork (radius === SHIP_REF_RADIUS === imported size).
  // Children (e.g. the exhaust flame) share the same transform, so they track the
  // ship's position, rotation and pulse. They're drawn first, behind the ship.
  renderShip() {
    const p = this.gameSession.p5;
    const col = p.color(this.color);
    const s = this.__scale * (this.radius / PulseObject.SHIP_REF_RADIUS);
    // Children inherit the ship transform. A 'blink' child (the flame) is animated
    // solely by toggling its visibility rapidly — never scaled or translated, so
    // it stays fixed below the nozzle.
    for (const child of this.children) {
      if (child.blink && !this._blinkOn()) continue;
      this._drawShapes(child.shapes, s, col);
    }
    this._drawShapes(this.shapes, s, col);
  }

  // Rapid on/off blink for the flame — visibility only. A fast base rate plus a
  // little jitter reads as a flickering exhaust; mostly lit, with quick offs.
  _blinkOn() {
    const t = this.gameSession.timeManager.realTimeSinceStartup;   // ms
    return Math.sin(t * 0.075) + (Math.random() - 0.5) * 0.6 > -0.2;
  }

  // Apply this object's transform (position, rotation, scale) and stroke to a set
  // of vector shapes, then render them. Shapes are authored in the ship's local
  // frame, so one shared transform keeps everything aligned.
  _drawShapes(shapes, s, col) {
    if (!shapes) return;
    for (const o of shapes) {
      o.x = this.x;
      o.y = this.y;
      o.rotation = this.rotation;
      o.scale = s;
      o.strokeColor = col;
      o.render();
    }
  }

  renderSelection() {
    if (!this.selected) return;
    const p = this.gameSession.p5;
    if (this.kind === 'downbeatGun') { this._renderResizeHandles(p); return; }
    p.push();
    p.noFill();
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1.5);
    p.circle(this.x, this.y, this.radius * 2 + 14);
    p.pop();
  }

  // The quad outline plus a draggable handle at each corner (rest, unscaled size). Each
  // handle moves just its own vertex, so any quadrilateral can be made (see RtdManager).
  _renderResizeHandles(p) {
    const cs = this.corners();
    p.push();
    p.noFill();
    p.stroke(255, 255, 255, 180);
    p.strokeWeight(1);
    p.beginShape();
    for (const c of cs) p.vertex(c.x, c.y);
    p.endShape(p.CLOSE);
    p.rectMode(p.CENTER);
    p.noStroke();
    p.fill(255);
    const s = PulseObject.HANDLE_SIZE;
    for (const c of cs) p.rect(c.x, c.y, s, s);
    p.pop();
  }

  // Plain editable state for persistence. Runtime-only fields (shapes, timing,
  // p5, selection) are omitted; a 'ship' keeps its svg source so its shapes can
  // be rebuilt on load. The manager keys these by instance id (see serialize).
  serialize() {
    const s = {
      name: this.name,
      kind: this.kind,
      isPrototype: this.isPrototype,
      prototypeId: this.prototypeId,
      x: this.x,
      y: this.y,
      radius: this.radius,
      color: this.color,
      bpm: this.bpm,
      pulseScale: this.pulseScale,
      relax: this.relax,
      sound: this.sound,
      volume: this.volume,
      muted: this.muted,
      division: this.division,
      phaseOffset: this.phaseOffset,
    };
    if (this.kind === 'ship' && this.svg) s.svg = this.svg;
    if (this.kind === 'downbeatGun') s.verts = this.verts.map((v) => ({ x: v.x, y: v.y }));
    if (Object.keys(this.overrides).length) s.overrides = { ...this.overrides };
    return s;
  }

  // Hit test in screen space (rest size). A downbeatGun tests its quad polygon; the
  // rest are circles by radius.
  contains(x, y) {
    if (this.kind === 'downbeatGun') return PulseObject.pointInPoly(x, y, this.corners());
    const dx = x - this.x;
    const dy = y - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}

// A ship whose radius equals this renders at its imported (targetSize) size.
PulseObject.SHIP_REF_RADIUS = 100;

// downbeatGun corner handles: on-screen size, grab tolerance.
PulseObject.HANDLE_SIZE = 9;
PulseObject.HANDLE_HIT = 10;

// Rectangle as four corner-vertex offsets (from centre), the default downbeatGun shape.
PulseObject.rectVerts = (w, h) => {
  const hw = w / 2, hh = h / 2;
  return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
};

// Ray-casting point-in-polygon (works for any quad, incl. concave / self-intersecting).
PulseObject.pointInPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};

// How far ahead (ms) to pre-schedule beats on the audio clock. Must exceed the frame
// interval so no beat is missed between frames; larger just queues further ahead.
PulseObject.LOOKAHEAD_MS = 100;
