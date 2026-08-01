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
    this.beatGrid = { epoch: 0, masterInterval: RtdManager.DEFAULT_MASTER_INTERVAL };
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

  // Load retained prototype templates from a saved scene (see serialize).
  restoreRetainedPrototypes(list) {
    this.__retainedPrototypes = Array.isArray(list) ? list.slice() : [];
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
        o[k] = proto[k];
      }
    }
  }

  // Switch mode. The object set is shared; this only changes behaviour (interactive
  // editing vs play) and clears the selection. Re-resolves the ship from the scene.
  setMode(mode) {
    if (mode === this.mode) return;
    this.select(null);
    this.mode = mode;
    this.ship = this._findShip();
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

  // Prototypes (and standalone objects) persist in full. A linked instance saves
  // only its reference — identity, placement and link — and drops the inherited
  // props, which reconstitute from its prototype on load. Nothing to go stale.
  _record(o) {
    const rec = o.serialize();
    if (o.prototypeId && !o.isPrototype) {
      for (const k of RtdManager.INHERITED) delete rec[k];
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

  // Move the grabbed object with the cursor. Editing an instance's position this
  // way sets the placement that persists on save (its default position).
  mouseDragged(x, y) {
    if (!this.__drag) return;
    this.__drag.obj.x = x + this.__drag.dx;
    this.__drag.obj.y = y + this.__drag.dy;
    this.__drag.moved = true;
  }

  mouseReleased() {
    if (this.__drag && this.__drag.moved) this._markDirty();   // a relocate persists on save
    this.__drag = null;
  }

  // A metronome is a juice-editor beat reference: it renders and ticks in the
  // 'objects' design space (so its prototype stays editable) and in 'editor' mode,
  // but is hidden and silent in real 'game' play. `modes` is set by the app; before
  // it exists nothing is hidden. Game and editor share the 'game' collection, so
  // this per-object check is what tells them apart.
  _hiddenInGame(o) {
    return o.kind === 'metronome' && this.modes && this.modes.current === 'game';
  }

  update() {
    this._publishGrid();                  // master metronome sets the shared tempo first
    this.moveShip();
    this.syncInstancesFromPrototypes();   // instances honor their prototype each frame
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
  }

  _findMaster() {
    return this.__objects.find((o) => o.kind === 'metronome') || null;
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
  }
}

RtdManager.SHIP_SPEED = 4;   // px per frame while a movement key is held
RtdManager.DEFAULT_MASTER_INTERVAL = 600;   // 100 bpm — grid tempo when no metronome exists
RtdManager.PROTO_PREFIX = 'p_';   // namespaces prototype names so instances can't collide

// Properties an instance inherits from its prototype (the editor-editable ones).
// Identity/placement (name, position, isPrototype) stay per-instance.
RtdManager.INHERITED = ['radius', 'color', 'bpm', 'pulseScale', 'relax', 'sound', 'volume', 'muted', 'division', 'phaseOffset'];
