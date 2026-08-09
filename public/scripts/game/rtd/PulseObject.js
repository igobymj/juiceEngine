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

import { runBehaviorOnBeat, runBehaviorOnDownbeat, fireOnDownbeat, fireAoeShell } from "./behaviors.js";

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
    this.label = opts.label ?? (this.kind === 'ship' ? 'spaceship' : this.kind === 'metronome' ? 'metronome' : this.kind === 'drumKick' ? 'drum kick' : this.kind === 'downbeatGun' ? 'downbeat gun' : this.kind === 'fourMeasureGun' ? 'four measure gun' : 'kick-circle');
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
    this.color = opts.color ?? (shipLike ? '#cfc7e6' : this.kind === 'drumKick' ? '#e6a15c' : this.kind === 'downbeatGun' ? '#7bd88b' : this.kind === 'fourMeasureGun' ? '#e0567b' : '#8b7bd8');
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
    this.behavior = opts.behavior ?? 'none';  // attached behaviour name (see behaviors.js)
    // Four-measure-gun shell params (ignored by other kinds): shot speed (px/ms, slow)
    // and the blast area-of-effect radius (px). Both tuned in the object editor.
    this.projectileSpeed = opts.projectileSpeed ?? 0.3;
    this.aoeRadius = opts.aoeRadius ?? 90;
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
    // Time signature (metronome only): sets the bar length, so the "downbeat" is beat 1
    // of every bar. Stored as an "n/d" string; only the numerator (beats per bar) is
    // used for now. Published to the grid by RtdManager._publishGrid.
    this.timeSignature = opts.timeSignature ?? '4/4';

    // --- runtime state ---
    this.__scale = 1;
    this.selected = false;
    this.__attachedShip = null;   // set when a quad gun is collected by the ship (game mode); it then rides on the ship
    this.__attachSlot = null;     // which ship grab point (index into SHIP_ATTACH_POINTS) it rides on
    // Beat clocks start locked to the grid so the first pulse lands on the next grid
    // beat, not an off-grid one at creation/load. __lastVisualBeat drives the (frame-
    // accurate) visual pulse; __scheduledThrough is how far ahead the audio has been
    // scheduled on the sample-accurate audio clock (see update / _scheduleAudio).
    const t0 = this.gameSession.timeManager.realTimeSinceStartup;
    this.__lastVisualBeat = this._beatAt(t0);
    this.__lastDownbeat = this._downbeatAt(t0);   // for fire-on-downbeat (bar beat 1)
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

  // The most recent bar downbeat (bar beat 1) at or before t. A bar is beatsPerBar
  // master beats long, anchored on barOrigin — the beat the music dropped on, so that
  // moment is measure 1's downbeat (falls back to the grid epoch before any drop). So
  // "downbeat" means every 4th beat in 4/4, every 3rd in 3/4, from the drop.
  _downbeatAt(t) {
    const grid = this._grid();
    const origin = grid.barOrigin != null ? grid.barOrigin : grid.epoch;
    const bar = grid.masterInterval * Math.max(1, grid.beatsPerBar || 4);
    return origin + Math.floor((t - origin) / bar) * bar;
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
      this._onBeat();
    }

    // The bar downbeat (beat 1) is a separate, coarser event than the object's own beat,
    // and it's what fire-on-downbeat keys off — so detect it independently of subdivision.
    const db = this._downbeatAt(t);
    if (db > this.__lastDownbeat) {
      this.__lastDownbeat = db;
      this._onDownbeat(this._barIndexAt(db));
    }

    // Ease the scale back toward its rest size of 1.
    this.__scale += (1 - this.__scale) * this.relax;
  }

  // On the object's own (subdivided) beat: run whatever beat-driven behaviour is attached.
  _onBeat() {
    if (this.behavior && this.behavior !== 'none') runBehaviorOnBeat(this);
  }

  // On the bar downbeat: run downbeat-driven behaviours, and — because a collected quad
  // gun fires by virtue of being attached — auto-fire it even with no behaviour set. The
  // downbeat gun fires every bar (a normal shot); the four-measure gun fires a slow AOE
  // shell on the downbeat of every 4th measure. The behaviour guard avoids a double shot
  // when 'fire-on-downbeat' is also assigned.
  _onDownbeat(barIndex) {
    if (this.behavior && this.behavior !== 'none') runBehaviorOnDownbeat(this);
    if (!this.__attachedShip || this.behavior === 'fire-on-downbeat') return;
    if (this.kind === 'downbeatGun') fireOnDownbeat(this, this.gameSession);
    else if (this.kind === 'fourMeasureGun' && barIndex % 4 === 0) fireAoeShell(this, this.gameSession);
  }

  // The bar (measure) index of a downbeat time — bars counted from barOrigin (the music
  // drop = measure 1, index 0). Used to fire the four-measure gun on every 4th measure.
  _barIndexAt(dbTime) {
    const grid = this._grid();
    const origin = grid.barOrigin != null ? grid.barOrigin : grid.epoch;
    const bar = grid.masterInterval * Math.max(1, grid.beatsPerBar || 4);
    return Math.round((dbTime - origin) / bar);
  }

  // Pre-schedule every grid beat that falls within the lookahead window at its exact
  // audio-clock time. __scheduledThrough is a realTimeSinceStartup watermark of how
  // far ahead we've scheduled, so beats are enqueued exactly once. A stalled frame
  // (e.g. a backgrounded tab) is collapsed to "now", never a catch-up burst.
  _scheduleAudio(t) {
    // A quad gun isn't a per-beat drum: it sounds when it fires (see playSoundNow), so
    // skip the per-beat scheduling and let the shot carry the selected sound.
    if (this.isQuad()) return;
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

  // Play the object's selected sound immediately (honouring mute/volume). Used for an
  // event-driven shot — the downbeat gun — so the sound syncs with the (frame-detected)
  // fire, rather than the sample-accurate per-beat scheduling in _scheduleAudio.
  playSoundNow() {
    if (this.muted || !this.sound || this.sound === 'none') return;
    const snd = this.gameSession.soundManager.getSound(this.sound);
    if (snd && typeof snd.play === 'function') {
      snd.play({ volume: this.volume, at: window.Tone ? Tone.now() : 0 });
    }
  }

  // The quad-gun kinds: a free quadrilateral edited by corner handles, collected by the
  // ship, and firing on the beat/measure. They share all shape/edit/collect behaviour and
  // differ only in firing cadence and projectile (see _onDownbeat).
  isQuad() { return this.kind === 'downbeatGun' || this.kind === 'fourMeasureGun'; }

  render() {
    if (this.kind === 'ship') this.renderShip();
    else if (this.isQuad()) this.renderQuad();
    else if (this.kind === 'metronome') this.renderMetronome();
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

  // An iconic metronome: a trapezoid case (wide base, narrow top) with a pendulum that
  // reaches an extreme on each beat and crosses centre between beats — so it visibly
  // ticks the tempo — while the whole icon still pulses via __scale like every kind.
  renderMetronome() {
    const p = this.gameSession.p5;
    const r = this.radius;
    const grid = this._grid();
    const t = this.gameSession.timeManager.realTimeSinceStartup;
    const beats = grid.masterInterval > 0 ? (t - grid.epoch) / grid.masterInterval : 0;
    const swing = 0.5 * Math.cos(Math.PI * beats);   // ±0.5 rad; extreme on the beat, centre between

    const pivot = { x: 0, y: 0.55 * r };
    const L = 1.4 * r;                                // pendulum length
    const tip = { x: pivot.x + L * Math.sin(swing), y: pivot.y - L * Math.cos(swing) };
    const bob = { x: pivot.x + 0.62 * L * Math.sin(swing), y: pivot.y - 0.62 * L * Math.cos(swing) };

    p.push();
    p.translate(this.x, this.y);
    p.scale(this.__scale);

    // case
    p.noStroke();
    p.fill(this.color);
    p.beginShape();
    p.vertex(-0.68 * r, 0.9 * r);
    p.vertex(0.68 * r, 0.9 * r);
    p.vertex(0.26 * r, -0.95 * r);
    p.vertex(-0.26 * r, -0.95 * r);
    p.endShape(p.CLOSE);

    // pendulum rod, bob and pivot (dark, so they read against the case)
    p.stroke(20, 18, 28);
    p.strokeWeight(Math.max(1, 0.07 * r));
    p.line(pivot.x, pivot.y, tip.x, tip.y);
    p.noStroke();
    p.fill(20, 18, 28);
    p.push();
    p.translate(bob.x, bob.y);
    p.rotate(swing);
    p.rectMode(p.CENTER);
    p.rect(0, 0, 0.34 * r, 0.22 * r);   // sliding weight
    p.pop();
    p.circle(pivot.x, pivot.y, 0.16 * r);

    p.pop();
  }

  // A filled quadrilateral through the four corner verts (offsets from x,y), pulsing
  // about (x,y) like the other kinds. Its shape is edited via the corner handles.
  renderQuad() {
    const p = this.gameSession.p5;
    const sc = this.__scale;
    // Once collected, the gun rides on its assigned ship grab point (rotating with the
    // ship) — attached by its centroid, so the verts are drawn relative to that centre.
    // Otherwise it sits at its own position with verts offset from (x,y).
    let bx = this.x, by = this.y, rot = 0, cx = 0, cy = 0;
    if (this.__attachedShip) {
      const pts = PulseObject.shipAttachPoints(this.__attachedShip);
      const gp = pts[this.__attachSlot] || pts[0];
      bx = gp.x; by = gp.y; rot = this.__attachedShip.rotation;
      const ct = this.vertCentroid(); cx = ct.x; cy = ct.y;
    }
    const c = Math.cos(rot), s = Math.sin(rot);
    p.push();
    p.noStroke();
    p.fill(this.color);
    p.beginShape();
    for (const v of this.verts) {
      const vx = (v.x - cx) * sc, vy = (v.y - cy) * sc;
      p.vertex(bx + vx * c - vy * s, by + vx * s + vy * c);
    }
    p.endShape(p.CLOSE);
    p.pop();
  }

  // The four rest-size (unscaled) corner points of a downbeatGun, in world space.
  corners() {
    return this.verts.map((v) => ({ x: this.x + v.x, y: this.y + v.y }));
  }

  // Move the origin (x,y) to the centroid of the verts, shifting the verts to
  // compensate so the shape doesn't move on screen. After reshaping, the origin can
  // drift far from the middle; re-centring makes the quad attach/pulse about its centre.
  recenterVerts() {
    const n = this.verts.length;
    if (!n) return;
    let cx = 0, cy = 0;
    for (const v of this.verts) { cx += v.x; cy += v.y; }
    cx /= n; cy /= n;
    this.x += cx; this.y += cy;
    for (const v of this.verts) { v.x -= cx; v.y -= cy; }
  }

  // Index of the corner handle under (x,y) for this (selected) downbeatGun, or -1.
  cornerHandleAt(x, y) {
    if (!this.isQuad() || !this.selected) return -1;
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
    this._renderAttachMarkers();
  }

  // Small translucent dots marking the ship's grab points (nose + fins), so their
  // placement is visible while tuning. A collected gun sits on top of one of them.
  _renderAttachMarkers() {
    const p = this.gameSession.p5;
    const d = Math.max(6, this.radius * 0.12);
    p.push();
    p.noStroke();
    p.fill(255, 255, 255, 90);
    for (const pt of PulseObject.shipAttachPoints(this)) p.circle(pt.x, pt.y, d);
    p.pop();
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
    if (this.isQuad()) { this._renderResizeHandles(p); return; }
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
      behavior: this.behavior,
      volume: this.volume,
      muted: this.muted,
      division: this.division,
      phaseOffset: this.phaseOffset,
      timeSignature: this.timeSignature,
    };
    if (this.kind === 'ship' && this.svg) s.svg = this.svg;
    if (this.isQuad()) s.verts = this.verts.map((v) => ({ x: v.x, y: v.y }));
    if (this.kind === 'fourMeasureGun') { s.projectileSpeed = this.projectileSpeed; s.aoeRadius = this.aoeRadius; }
    if (Object.keys(this.overrides).length) s.overrides = { ...this.overrides };
    return s;
  }

  // Local centroid (mean of the corner verts) — the quad's centre, as an offset from
  // (x,y). The grab point that a collected gun snaps to the ship.
  vertCentroid() {
    const n = this.verts.length;
    let cx = 0, cy = 0;
    for (const v of this.verts) { cx += v.x; cy += v.y; }
    return n ? { x: cx / n, y: cy / n } : { x: 0, y: 0 };
  }

  // Where the object currently lives in the world: its assigned ship grab point when
  // collected, otherwise its own centre (the quad's centroid, else its origin). Used by
  // behaviours (fire-on-downbeat) so a collected gun fires from the ship, not its home.
  worldOrigin() {
    if (this.__attachedShip) {
      const pts = PulseObject.shipAttachPoints(this.__attachedShip);
      return pts[this.__attachSlot] || pts[0] || { x: this.x, y: this.y };
    }
    if (this.isQuad()) {
      const c = this.vertCentroid();
      return { x: this.x + c.x, y: this.y + c.y };
    }
    return { x: this.x, y: this.y };
  }

  // Hit test in screen space (rest size). A downbeatGun tests its quad polygon; the
  // rest are circles by radius.
  contains(x, y) {
    if (this.isQuad()) return PulseObject.pointInPoly(x, y, this.corners());
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

// Grab points on the ship where collected guns attach, as ship-local offsets in
// fractions of the ship's radius (front = the nose direction = ship-local -Y). A gun
// snaps its centroid to the nearest free one. Tune the fractions to taste; later, guns
// may carry their own grab offset. Order: nose, left fin, right fin.
PulseObject.SHIP_ATTACH_POINTS = [
  { x: 0,     y: -0.7 },    // nose
  { x: -0.55, y: 0.55 },    // left fin
  { x: 0.55,  y: 0.55 },    // right fin
];

// The ship's grab points in world space (rotated with the ship).
PulseObject.shipAttachPoints = (ship) => {
  const r = ship.radius;
  const c = Math.cos(ship.rotation), s = Math.sin(ship.rotation);
  return PulseObject.SHIP_ATTACH_POINTS.map((pt) => {
    const lx = pt.x * r, ly = pt.y * r;
    return { x: ship.x + lx * c - ly * s, y: ship.y + lx * s + ly * c };
  });
};

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
