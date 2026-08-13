/*
 * RtdManager — owns the RTD rhythm objects (PulseObjects).
 *
 * There is ONE authored scene (this.__objects) shared by every mode. 'objects' mode
 * authors/edits it, 'editor' mode tunes juice over it, and 'game' mode plays it —
 * all rendering and updating the same objects. The mode only gates behaviour
 * (interactive select/drag vs play, what's hidden in play), not the object set, and
 * the whole scene persists as one section of rtd.json (see serialize).
 *
 * Mirrors the primitives CreatureManager's role for the editor: it tracks the
 * selected object and exposes onSelectionChange so the editor can re-render.
 * Registered as an update + render system by the app.
 */

import Manager from "../../engine/Managers/Manager.js";
import PulseObject from "./PulseObject.js";

export default class RtdManager extends Manager {
  constructor(gameSession) {
    super(gameSession);
    this.__objects = [];             // the single authored scene — every mode edits/plays it
    this.__idSeq = 0;                 // backs auto-generated instance ids
    this.selected = null;
    this.onSelectionChange = null;   // editor subscribes (selection changed)
    this.onObjectsChange = null;     // editor subscribes (objects added / removed)
    this.onSceneDirty = null;        // editor subscribes (a persistable change was made)
    this.ship = null;                // the scene's ship (driven by WASD / arrows in game mode)
    this.instantiate = null;         // app-set: (record) => object; knows how to build ship shapes
    this.mode = 'objects';           // 'objects' (edit) | 'editor' (tune) | 'game' (play) — gates behaviour, not the object set
    this.__drag = null;              // { obj, dx, dy } while dragging a selected object
    // Shared beat grid every PulseObject locks to, published each frame from the
    // master metronome (see _publishGrid). masterInterval = ms per master beat;
    // epoch is the grid's phase anchor (0 for now — reserved for a future
    // metronome-driven groove shift). See PulseObject._grid / _beatAt.
    // barOrigin: the beat time (realTimeSinceStartup, ms) the music dropped on — measure
    // 1's downbeat. null until a drop; measures count from the grid epoch until then.
    this.beatGrid = { epoch: 0, masterInterval: RtdManager.DEFAULT_MASTER_INTERVAL, beatsPerBar: 4, barOrigin: null };
    // Templates of prototypes whose on-canvas object was deleted — kept so the type
    // stays selectable in the create dropdown (and re-stampable). Plain records (from
    // serialize()), not live objects; persisted with the scene. See deleteSelected /
    // createFromPrototype / prototypeChoices.
    this.__retainedPrototypes = [];
  }

  // The single authored scene — every mode renders, updates, and edits the same set.
  get objects() { return this.__objects; }
  get _allObjects() { return this.__objects; }

  get prototypes() { return this.__objects.filter((o) => o.isPrototype); }

  // Names offered in the create dropdown: live prototypes plus retained templates of
  // deleted ones (live wins on a name clash). Returns [{ name }].
  prototypeChoices() {
    const seen = new Set();
    const out = [];
    for (const p of this.prototypes) if (!seen.has(p.name)) { seen.add(p.name); out.push({ name: p.name }); }
    for (const r of this.__retainedPrototypes) if (!seen.has(r.name)) { seen.add(r.name); out.push({ name: r.name }); }
    return out;
  }

  // Load retained prototype templates from a saved scene (see serialize), migrating any
  // legacy kind names so the seeder guards (hasRetainedKind) match the current kinds.
  restoreRetainedPrototypes(list) {
    this.__retainedPrototypes = Array.isArray(list)
      ? list.map((r) => ({ ...r, kind: PulseObject.MIGRATE_KIND[r.kind] || r.kind }))
      : [];
  }

  // Whether a prototype of this kind was deleted (kept as a retained template). The
  // seeders use it so a deleted default prototype isn't re-created on load.
  hasRetainedKind(kind) {
    return this.__retainedPrototypes.some((r) => r.kind === kind);
  }

  // Create a pulse object in the authored scene.
  createObject(opts = {}) {
    const obj = new PulseObject(this.gameSession, opts);
    obj.id = this._adoptId(opts.id);
    obj.name = this._adoptName(opts.name, obj.label, obj.isPrototype);   // globally unique
    this.__objects.push(obj);
    if (obj.kind === 'ship') this.ship = obj;
    // Auto-select interactive creates while editing; scene load/default pass select:false.
    if (this.mode === 'objects' && opts.select !== false) this.select(obj);
    if (this.onObjectsChange) this.onObjectsChange();
    this._markDirty();   // no-op during scene load (no subscriber yet); flags user adds
    return obj;
  }

  // Signal a persistable change (add / delete / rename / relocate) so the editor
  // can surface its save affordance. Silent until something subscribes, so loading
  // a scene doesn't mark it dirty.
  _markDirty() {
    if (this.onSceneDirty) this.onSceneDirty();
  }

  // Create a new object by cloning a prototype's settings into the active
  // collection. The copy is a plain instance (isPrototype false) with its own
  // unique name. Ship shapes are rebuilt via `instantiate`. opts.x/opts.y place
  // it (e.g. at a game-mode click); otherwise it's nudged off the prototype.
  createFromPrototype(name, opts = {}) {
    if (!this.instantiate) return null;
    // Prefer a live prototype (the instance links to it and syncs each frame);
    // otherwise stamp from a retained template of a deleted prototype — a standalone
    // object with the template's values and nothing to sync to.
    const proto = this.prototypes.find((o) => o.name === name);
    const base = proto ? proto.serialize() : this.__retainedPrototypes.find((r) => r.name === name);
    if (!base) return null;
    const rec = { ...base };
    rec.isPrototype = false;
    rec.prototypeId = proto ? proto.id : null;   // link so later prototype edits propagate here
    rec.x = opts.x ?? (rec.x ?? 0) + 40;
    rec.y = opts.y ?? (rec.y ?? 0) + 40;
    // rec.name stays the prototype's; createObject uniquifies it (e.g. "spaceship 1").
    return this.instantiate(rec);
  }

  // Instances mirror their prototype's editable properties, pulled every frame so an
  // instance always honors the current prototype however it changed. Prototype lookups
  // (by id link, or by the bare name an instance was generated from — "<prototype> N")
  // are built once per call: O(n) total instead of an O(n) find per instance. Per-
  // instance identity/placement and overridden props are left alone.
  syncInstancesFromPrototypes() {
    const objs = this.__objects;
    let byId = null, byBare = null;
    for (const o of objs) {
      if (!o.isPrototype) continue;
      (byId ??= new Map()).set(o.id, o);
      (byBare ??= new Map()).set(this._bareName(o.name), o);
    }
    if (!byId) return;   // no prototypes → nothing to sync
    for (const o of objs) {
      if (o.isPrototype) continue;
      let proto = o.prototypeId ? byId.get(o.prototypeId) : null;
      if (!proto && o.name) {
        proto = byBare.get(String(o.name).replace(/\s+\d+$/, '').trim());
        if (proto) o.prototypeId = proto.id;   // heal the link so it persists on next save
      }
      if (!proto) continue;
      const ov = o.overrides;
      for (const k of RtdManager.INHERITED) {
        if (ov && ov[k]) continue;   // per-instance override keeps its own value
        o[k] = Array.isArray(proto[k]) ? [...proto[k]] : proto[k];   // clone arrays (e.g. patternSteps)
      }
    }
  }

  // Switch mode. The object set is shared; this only changes behaviour (interactive
  // editing vs play) and clears the selection. Re-resolves the ship from the scene.
  setMode(mode) {
    if (mode === this.mode) return;
    this.select(null);
    this._clearLauncherAttachments();   // collection is game-runtime only; reset on any mode change
    this.mode = mode;
    this.ship = this._findShip();
  }

  // In game mode a quad launcher is collected only when the ship's grab point for the
  // launcher's chosen zone (attachPoint: nose | left | right) actually overlaps it — you
  // have to touch the launcher with the RIGHT part of the ship. It then rides on that point
  // by its centroid (see PulseObject.shipAttachPoints / worldOrigin). One launcher per grab
  // point: a chosen point already taken by another launcher blocks collection.
  _collectLaunchers() {
    const ship = this.ship;
    if (!ship || ship.kind !== 'ship') return;
    const points = PulseObject.shipAttachPoints(ship);
    const zoneR = ship.radius * PulseObject.ATTACH_ZONE;
    const occupied = new Set();
    for (const o of this.__objects) {
      if (o.__attachedShip === ship && o.__attachSlot != null) occupied.add(o.__attachSlot);
    }
    for (const o of this.__objects) {
      if (!o.isQuad() || o.__attachedShip || o.__expired) continue;   // consumed launchers stay gone
      // Among the launcher's candidate grab points (one for nose/left/right, both sides for
      // 'either'), take the nearest that's free AND whose zone overlaps the launcher.
      const candidates = PulseObject.ATTACH_CANDIDATES[o.attachPoint] || [0];
      let best = -1, bestD = Infinity;
      for (const slot of candidates) {
        if (occupied.has(slot)) continue;
        if (!this._zoneTouchesLauncher(points[slot], zoneR, o)) continue;
        const d = Math.hypot(points[slot].x - o.x, points[slot].y - o.y);
        if (d < bestD) { bestD = d; best = slot; }
      }
      if (best < 0) continue;
      o.__attachedShip = ship;
      o.__attachSlot = best;
      o.__attachTime = this.gameSession.timeManager.realTimeSinceStartup;   // start the lifespan clock
      occupied.add(best);
    }
  }

  // Whether a ship grab-point zone (a disc of `radius` at `point`) overlaps the launcher:
  // the point is inside the launcher's quad, or its origin or a corner is within the zone.
  // (Origin distance alone misses a reshaped launcher whose body sits away from its origin.)
  _zoneTouchesLauncher(point, radius, launcher) {
    if (launcher.contains(point.x, point.y)) return true;
    if (Math.hypot(launcher.x - point.x, launcher.y - point.y) < radius) return true;
    return launcher.corners().some((c) => Math.hypot(c.x - point.x, c.y - point.y) < radius);
  }

  // Reset all launcher runtime state (attachment + lifespan) — collection and consumption
  // are per-round, so a mode change restores every launcher to the scene.
  _clearLauncherAttachments() {
    for (const o of this.__objects) {
      if (!o.isQuad()) continue;
      o.__attachedShip = null; o.__attachSlot = null; o.__attachTime = null; o.__expired = false; o.__alpha = 1;
    }
  }

  // Set an object's name, keeping it unique among all objects (both collections).
  // Prototype names are namespaced with a "p_" prefix and instance names have it
  // stripped, so the two never collide (see _normalizeName).
  renameObject(obj, name) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return;
    const wanted = this._normalizeName(trimmed, obj.isPrototype);
    const taken = new Set(this._allObjects.filter((o) => o !== obj).map((o) => o.name));
    obj.name = taken.has(wanted) ? this._uniqueName(wanted, taken) : wanted;
    this._markDirty();
  }

  // Prototype names carry a "p_" prefix; instance names never do. Normalizing on
  // this rule at every naming point keeps the two namespaces from colliding, so an
  // instance can freely take the plain name its prototype is based on.
  _normalizeName(name, isPrototype) {
    const s = String(name ?? '').trim();
    const bare = s.startsWith(RtdManager.PROTO_PREFIX) ? s.slice(RtdManager.PROTO_PREFIX.length) : s;
    return isPrototype ? RtdManager.PROTO_PREFIX + bare : bare;
  }

  // The plain (prefix-free) form of a name — used to match instances to prototypes.
  _bareName(name) {
    const s = String(name ?? '').trim();
    return s.startsWith(RtdManager.PROTO_PREFIX) ? s.slice(RtdManager.PROTO_PREFIX.length) : s;
  }

  // Use a caller-supplied id (e.g. loaded from disk) or mint the next one,
  // keeping the sequence ahead of any adopted "obj-N" ids so future ones don't collide.
  _adoptId(id) {
    if (id) {
      const m = /^obj-(\d+)$/.exec(id);
      if (m) this.__idSeq = Math.max(this.__idSeq, Number(m[1]));
      return id;
    }
    return `obj-${++this.__idSeq}`;
  }

  // Keep a caller-supplied name if free, otherwise derive a unique one from it
  // (or from a fallback base). Evaluated against every object in both collections.
  _adoptName(name, fallbackBase, isPrototype) {
    const taken = new Set(this._allObjects.map((o) => o.name));
    const base = (name && String(name).trim()) || fallbackBase || 'object';
    const desired = this._normalizeName(base, isPrototype);   // apply/strip the "p_" prefix
    if (!taken.has(desired)) return desired;
    return this._uniqueName(desired, taken);
  }

  // "base", "base 2", "base 3", … until one isn't in `taken`.
  _uniqueName(base, taken) {
    const stem = String(base).replace(/\s+\d+$/, '').trim() || 'object';
    let n = 1, name;
    do { name = n === 1 ? stem : `${stem} ${n}`; n++; } while (taken.has(name));
    return name;
  }

  _findShip() {
    const coll = this.objects;
    for (let i = coll.length - 1; i >= 0; i--) if (coll[i].kind === 'ship') return coll[i];
    return null;
  }

  // Persistable scene: the authored objects keyed by instance id, plus the retained
  // prototype templates. (Legacy saves also had a 'game' section — see the loader.)
  serialize() {
    const objects = {};
    for (const o of this.__objects) objects[o.id] = this._record(o);
    return {
      objects,
      retainedPrototypes: this.__retainedPrototypes,
    };
  }

  // Prototypes and standalone objects persist in full. A linked instance drops the
  // inherited props that reconstitute from its prototype on load — but ONLY those a
  // LIVE prototype can restore and that the instance doesn't override. An orphaned
  // instance (prototype deleted) or an overridden prop keeps its own value, else the
  // edit is lost on save.
  _record(o) {
    const rec = o.serialize();
    const liveProto = o.prototypeId && !o.isPrototype
      && this.__objects.some((p) => p.isPrototype && p.id === o.prototypeId);
    if (liveProto) {
      for (const k of RtdManager.INHERITED) {
        if (o.overrides && o.overrides[k]) continue;   // keep per-instance overrides
        delete rec[k];
      }
    }
    return rec;
  }

  select(obj) {
    if (obj === this.selected) return;
    if (this.selected) this.selected.selected = false;
    this.selected = obj;
    if (obj) obj.selected = true;
    if (this.onSelectionChange) this.onSelectionChange();
  }

  deleteSelected() {
    if (!this.selected) return;
    // A deleted prototype leaves its template behind, so the type stays selectable in
    // the create dropdown and survives the save. Newest wins on a name clash.
    if (this.selected.isPrototype) this._retainPrototype(this.selected);
    const coll = this.objects;
    const i = coll.indexOf(this.selected);
    if (i >= 0) coll.splice(i, 1);
    if (this.selected === this.ship) this.ship = null;
    this.selected = null;
    if (this.onSelectionChange) this.onSelectionChange();
    if (this.onObjectsChange) this.onObjectsChange();
    this._markDirty();
  }

  _retainPrototype(obj) {
    const rec = obj.serialize();
    this.__retainedPrototypes = this.__retainedPrototypes.filter((r) => r.name !== rec.name);
    this.__retainedPrototypes.push(rec);
  }

  // Whether canvas clicks select / drag objects. True while editing ('objects') and
  // tuning ('editor'); false in plain 'game' play, where clicks belong to gameplay.
  get interactive() {
    return this.mode !== 'game';
  }

  // Click selects the topmost object under the cursor (or deselects) and begins a
  // drag on it; releasing ends the drag. No-op during gameplay (see interactive).
  mousePressed(x, y) {
    if (!this.interactive) return;
    // A selected downbeatLauncher's corner handle starts reshaping that one vertex — checked
    // first, since a handle sits on the shape's edge and takes priority over relocating.
    if (this.selected && this.selected.cornerHandleAt) {
      const vi = this.selected.cornerHandleAt(x, y);
      if (vi >= 0) { this.__drag = { obj: this.selected, mode: 'vertex', vi, moved: false }; return; }
    }
    const coll = this.objects;
    for (let i = coll.length - 1; i >= 0; i--) {
      const o = coll[i];
      if (this._hiddenInGame(o)) continue;   // can't grab what isn't drawn
      if (o.contains(x, y)) {
        this.select(o);
        this.__drag = { obj: o, dx: o.x - x, dy: o.y - y, moved: false };   // keep the grab offset
        return;
      }
    }
    this.select(null);
  }

  // Drag the grabbed object: move one corner vertex (a handle) or move the whole object.
  // A vertex drag reshapes just that corner, so any quadrilateral can be made. Either
  // persists on save.
  mouseDragged(x, y) {
    const d = this.__drag;
    if (!d) return;
    if (d.mode === 'vertex') {
      d.obj.verts[d.vi] = { x: x - d.obj.x, y: y - d.obj.y };   // store as an offset from (x,y)
    } else {
      d.obj.x = x + d.dx;
      d.obj.y = y + d.dy;
    }
    d.moved = true;
  }

  mouseReleased() {
    if (this.__drag && this.__drag.moved) this._markDirty();   // a relocate/reshape persists on save
    this.__drag = null;
  }

  // A metronome is a juice-editor beat reference: it renders and ticks in the
  // 'objects' design space (so its prototype stays editable) and in 'editor' mode,
  // but is hidden and silent in real 'game' play. `modes` is set by the app; before
  // it exists nothing is hidden. Game and editor share the 'game' collection, so
  // this per-object check is what tells them apart.
  _hiddenInGame(o) {
    if (!this.modes || this.modes.current !== 'game') return false;
    // Design-space only in real play: prototypes (templates — only placed instances are
    // gameplay objects), the metronome (beat reference), and projectile definitions (a
    // fired-from template). A consumed launcher (lifespan spent) is gone too, and a "spawn
    // at launch" object stays hidden until the music has dropped (the launch).
    return o.isPrototype || o.kind === 'metronome' || o.kind === 'projectile' || o.__expired
      || (o.spawnAtLaunch && !this.__musicDropped);
  }

  update() {
    this._publishGrid();                  // master metronome sets the shared tempo first
    this.moveShip();
    this.syncInstancesFromPrototypes();   // instances honor their prototype each frame
    if (this.mode === 'game') this._collectLaunchers();   // ship picks up downbeat launchers it touches
    for (const o of this.objects) { if (this._hiddenInGame(o)) continue; o.update(); }
  }

  // The core metronome is the master clock: its bpm sets the grid tempo, and its
  // phaseOffset manually aligns the grid's phase (epoch) — slide it to lock the pulse
  // to a fixed music track. Authored in the 'objects' collection, so it drives
  // game-mode instances too. No metronome → default tempo, epoch 0; objects still
  // lock to one another. phaseOffset is a fraction of a master beat.
  _publishGrid() {
    const master = this._findMaster();
    const interval = master ? master.interval : RtdManager.DEFAULT_MASTER_INTERVAL;
    this.beatGrid.masterInterval = interval;
    this.beatGrid.epoch = master ? (master.phaseOffset ?? 0) * interval : 0;
    // Bar length in master beats, from the metronome's time signature (numerator).
    // Defines the downbeat (bar beat 1); defaults to 4/4 when there's no metronome.
    this.beatGrid.beatsPerBar = RtdManager.beatsPerBar(master && master.timeSignature);
  }

  _findMaster() {
    return this.__objects.find((o) => o.kind === 'metronome') || null;
  }

  // Change an object's high-level type (from the editor's type dropdown), updating its kind
  // to the type's canonical kind so rendering/behaviour follow. A launcher keeps its current
  // launcher kind (preserving a four-measure preset); everything else takes the canonical
  // kind. Kind-specific fields already exist on every PulseObject (defaults), so no re-init.
  convertType(o, type) {
    o.type = type;
    if (type === 'launcher') { if (!o.isQuad()) o.kind = 'downbeatLauncher'; }
    else o.kind = PulseObject.TYPE_KIND[type] || type;
    this._markDirty();
  }

  // Resolve a launcher's attached projectile (referenced by its bare, prefix-free name) to a
  // plain definition the ProjectileManager can spawn — matching a prototype or instance
  // regardless of the "p_" prefix, preferring a prototype. Falls back to a plain bullet.
  projectileDef(name) {
    const matches = this.__objects.filter((o) => o.kind === 'projectile' && this._bareName(o.name) === name);
    const p = matches.find((o) => o.isPrototype) || matches[0];
    if (!p) return { shape: 'circle', fill: true, size: 6, color: '#ffffff', speed: 1, explodes: false, aoeRadius: 90, lifetime: 800, spinSpeed: 0, beatpulse: 0 };
    return {
      shape: p.shape, fill: p.fill, size: p.size, color: p.color, speed: p.speed,
      explodes: p.explodes, aoeRadius: p.aoeRadius, lifetime: p.lifetime,
      spinSpeed: p.spinSpeed, beatpulse: p.beatpulse,
    };
  }

  // Anchor the measure grid so `originTime` (a beat time, realTimeSinceStartup ms) is
  // measure 1's downbeat — called when the music drops. Resets each object's downbeat
  // clock so the downbeat at the new origin fires cleanly as the first measure.
  anchorMeasures(originTime) {
    this.beatGrid.barOrigin = originTime;
    for (const o of this.__objects) o.__lastStep = -1;   // step 0 (the new measure 1) fires cleanly
  }

  // Clear the measure anchor (new round): measures count from the grid epoch until the
  // music next drops and re-anchors.
  clearMeasureAnchor() {
    this.beatGrid.barOrigin = null;
  }

  // Live grid phase = the master metronome's phaseOffset (a fraction of a beat, -0.5..0.5).
  gridPhase() {
    const m = this._findMaster();
    return m ? (m.phaseOffset || 0) : 0;
  }

  // Nudge the grid phase (the editor's phase-align slider and the in-game slider both
  // use this). Marks it as a per-instance override so a synced metronome instance keeps it.
  setGridPhase(v) {
    const m = this._findMaster();
    if (!m) return;
    m.phaseOffset = v;
    if (!m.isPrototype) (m.overrides || (m.overrides = {})).phaseOffset = true;
  }

  // Drive the ship with WASD / arrow keys — except the up arrow, which is bound to
  // fire (see rtd.js), so only W raises the ship (down/left/right arrows still move).
  // Read directly here rather than via inputObject.movement so the base movement
  // mapping (shared with other apps) keeps the up arrow. Moving the ship object's
  // position carries its shapes (they follow it.x/it.y at render time).
  moveShip() {
    if (!this.ship) return;
    const p = this.gameSession.p5;
    const x = (p.keyIsDown(68) || p.keyIsDown(39) ? 1 : 0) - (p.keyIsDown(65) || p.keyIsDown(37) ? 1 : 0);   // D/→  −  A/←
    const y = (p.keyIsDown(83) || p.keyIsDown(40) ? 1 : 0) - (p.keyIsDown(87) ? 1 : 0);                       // S/↓  −  W (no ↑)
    if (x === 0 && y === 0) return;
    const gs = this.gameSession;
    // Clamp the ship's center to the screen (per-axis, so pushing into an edge
    // still slides along it). The ship may extend half off-screen at the edges.
    this.ship.x = Math.max(0, Math.min(gs.canvasWidth, this.ship.x + x * RtdManager.SHIP_SPEED));
    this.ship.y = Math.max(0, Math.min(gs.canvasHeight, this.ship.y + y * RtdManager.SHIP_SPEED));
  }

  render() {
    for (const o of this.objects) { if (this._hiddenInGame(o)) continue; o.render(); }
    this._renderBpmReadout();
  }

  // Persistent debug readout (upper-left, clear of the tab bars): the live master
  // tempo in bpm, from the beat grid (the metronome's bpm, or the default tempo when
  // there's no metronome).
  _renderBpmReadout() {
    const p = this.gameSession.p5;
    const interval = this.beatGrid && this.beatGrid.masterInterval;
    const bpm = interval ? 60000 / interval : 0;
    p.push();
    p.noStroke();
    p.fill(207, 199, 230);
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(13);
    p.text('metronome: ' + bpm.toFixed(0) + ' bpm', 14, 92);
    p.pop();
  }
}

RtdManager.SHIP_SPEED = 4;   // px per frame while a movement key is held
RtdManager.DEFAULT_MASTER_INTERVAL = 600;   // 100 bpm — grid tempo when no metronome exists
RtdManager.PROTO_PREFIX = 'p_';   // namespaces prototype names so instances can't collide

// Properties an instance inherits from its prototype (the editor-editable ones).
// Identity/placement (name, position, isPrototype) stay per-instance.
RtdManager.INHERITED = ['radius', 'color', 'bpm', 'pulseScale', 'relax', 'sound', 'behavior', 'volume', 'muted', 'division', 'phaseOffset', 'timeSignature', 'spawnAtLaunch', 'projectile', 'patternMeasures', 'patternSteps', 'attachPoint', 'lifespanPhrases', 'shape', 'fill', 'size', 'speed', 'explodes', 'aoeRadius', 'lifetime', 'spinSpeed', 'beatpulse'];

// Beats per bar from an "n/d" time-signature string (the numerator); 4 by default.
RtdManager.beatsPerBar = (sig) => {
  const n = parseInt(String(sig || '4/4').split('/')[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
};
