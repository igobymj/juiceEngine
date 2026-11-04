/*
 * RtdManager — owns the RTD rhythm objects (PulseObjects).
 *
 * Objects split into GLOBAL prototypes (authored in 'objects' mode) and per-SCENE
 * instances. Prototypes live in __objects always and are shared by every scene; each
 * scene owns its own placed instances, and only the ACTIVE scene's instances sit in
 * __objects alongside the prototypes (inactive scenes are parked as records — see the
 * Scenes section). 'editor' mode picks the active scene via its tab bar. The mode gates
 * behaviour (interactive select/drag vs play, what's hidden in play), not the object set.
 * Prototypes + every scene persist as sections of rtd.json (see serialize).
 *
 * Mirrors the primitives CreatureManager's role for the editor: it tracks the
 * selected object and exposes onSelectionChange so the editor can re-render.
 * Registered as an update + render system by the app.
 */

import Manager from "../../engine/Managers/Manager.js";
import PulseObject from "./PulseObject.js";
import Projectile from "./Projectile.js";
import Asteroid from "./Asteroid.js";

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
    // Scenes. OBJECTS-mode prototypes are GLOBAL — always present in __objects, shared by
    // every scene. Each scene owns its own set of placed INSTANCES (non-prototype objects).
    // The active scene's instances live in __objects alongside the global prototypes; the
    // instances of inactive scenes are parked as records in __sceneStore until selected.
    // __scenes is the ordered tab list [{ id, name }]; __activeSceneId names the live one.
    this.__scenes = [];
    this.__sceneStore = new Map();   // sceneId -> [instance records] (inactive scenes only)
    this.__activeSceneId = null;
    this.__sceneSeq = 0;             // backs auto-generated "scene-N" ids
    this.onScenesChange = null;      // editor subscribes (scene added / removed / renamed / switched)
    this.__suspendDirty = false;     // set while (re)instantiating on a scene switch, so it stays clean
    // Editor projectile previews — sample shots the projectile editor fires to audition a
    // definition's rotation/speed/lifetime. Owned here (not the mode-gated ProjectileManager)
    // so they render in OBJECTS mode too; ticked/drawn each frame, removed when they expire.
    this.__previews = [];
  }

  // The active working set — global prototypes + the active scene's instances. Every mode
  // renders, updates, and edits the same set (only the active scene's instances at a time).
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

  // ---- Scenes -------------------------------------------------------------
  // The active scene's instances live in __objects; inactive scenes are parked as records.

  // The tab list (id, name, playOrder), in order. The editor renders one tab per entry.
  // playOrder is the sequence game mode plays scenes in; it must be unique (see
  // assertUniquePlayOrder) and defaults to 0.
  sceneList() { return this.__scenes.map((s) => ({ id: s.id, name: s.name, playOrder: s.playOrder })); }
  get activeSceneId() { return this.__activeSceneId; }

  // Install the scene tab list and the active id (from a load). Instance instantiation is
  // driven by the app; inactive scenes are handed to parkSceneRecords. Seeds the id counter
  // past any loaded "scene-N" so new ids don't collide.
  initScenes(metaList, activeId) {
    this.__scenes = (metaList || []).map((m) => ({ id: m.id, name: m.name, playOrder: Number(m.playOrder) || 0 }));
    this.__sceneStore = new Map();
    this.__activeSceneId = activeId || (this.__scenes[0] && this.__scenes[0].id) || null;
    for (const s of this.__scenes) {
      const m = /^scene-(\d+)$/.exec(s.id);
      if (m) this.__sceneSeq = Math.max(this.__sceneSeq, Number(m[1]));
    }
  }

  // Park an inactive scene's instance records (from a load). Kept until the scene is selected.
  parkSceneRecords(id, records) { this.__sceneStore.set(id, Array.isArray(records) ? records : []); }

  // Switch the active scene: serialize the current instances back to the store, strip them
  // from __objects (prototypes stay — they're global), then re-instantiate the target scene's
  // records. Selection, ship and launcher-attachment runtime reset for the new scene.
  switchScene(id) {
    if (id === this.__activeSceneId || !this.__scenes.some((s) => s.id === id)) return;
    // Park the current scene's live instances as save-ready records, removing them in place.
    const parked = [];
    for (let i = this.__objects.length - 1; i >= 0; i--) {
      if (this.__objects[i].isPrototype) continue;
      // serialize() omits the id — carry it so _parkedObjects keys each record uniquely.
      parked.unshift({ ...this._record(this.__objects[i]), id: this.__objects[i].id });
      this.__objects.splice(i, 1);
    }
    this.__sceneStore.set(this.__activeSceneId, parked);
    this.__activeSceneId = id;
    this.select(null);
    this.ship = null;
    this.__gameShipReady = false;        // game mode re-ensures a ship for the new scene
    this._clearLauncherAttachments();
    // Re-instantiate the target scene's parked records (async ships resolve into __objects).
    const recs = this.__sceneStore.get(id) || [];
    this.__sceneStore.delete(id);
    this.__suspendDirty = true;
    for (const rec of recs) { if (this.instantiate) this.instantiate({ ...rec, select: false }); }
    this.__suspendDirty = false;
    this.ship = this._findShip();
    if (this.onObjectsChange) this.onObjectsChange();
    if (this.onScenesChange) this.onScenesChange();
  }

  // Add a new (empty) scene and switch to it. playOrder defaults to 0 (like the first
  // scene) — the author assigns a distinct order per scene; a collision is caught when game
  // mode is invoked (assertUniquePlayOrder).
  addScene(name) {
    const id = `scene-${++this.__sceneSeq}`;
    this.__scenes.push({ id, name: this._uniqueSceneName(name || 'Scene'), playOrder: 0 });
    this._markDirty();
    this.switchScene(id);            // parks the current scene, activates the empty new one
    if (this.onScenesChange) this.onScenesChange();
    return id;
  }

  // Set a scene's play order (the game-mode sequence position). Coerced to an integer;
  // uniqueness is enforced lazily when game mode starts, not here, so authoring stays free.
  setScenePlayOrder(id, order) {
    const s = this.__scenes.find((x) => x.id === id);
    if (!s) return;
    const n = Math.trunc(Number(order));
    s.playOrder = Number.isFinite(n) ? n : 0;
    this._markDirty();
    if (this.onScenesChange) this.onScenesChange();
  }

  // Throw if two scenes share a play order (invoked on entering game mode). Names the
  // colliding order so the author can fix it.
  assertUniquePlayOrder() {
    const seen = new Map();
    for (const s of this.__scenes) {
      if (seen.has(s.playOrder)) {
        throw new Error(`Rhythm Space: scenes "${seen.get(s.playOrder)}" and "${s.name}" share play order ${s.playOrder} — play order must be unique.`);
      }
      seen.set(s.playOrder, s.name);
    }
  }

  // Rename a scene (kept unique among scene names).
  renameScene(id, name) {
    const s = this.__scenes.find((x) => x.id === id);
    if (!s) return;
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return;
    s.name = this._uniqueSceneName(trimmed, id);
    this._markDirty();
    if (this.onScenesChange) this.onScenesChange();
  }

  // Delete a scene. Always keeps at least one. Deleting the active scene switches to a
  // neighbour first (which parks the doomed instances), then drops its record.
  deleteScene(id) {
    if (this.__scenes.length <= 1) return;
    const idx = this.__scenes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    if (id === this.__activeSceneId) {
      const next = this.__scenes[idx + 1] || this.__scenes[idx - 1];
      this.switchScene(next.id);
    }
    this.__scenes = this.__scenes.filter((s) => s.id !== id);
    this.__sceneStore.delete(id);
    this._markDirty();
    if (this.onScenesChange) this.onScenesChange();
  }

  // "Scene", "Scene 2", … unique among the other scenes' names (id excluded from the check).
  _uniqueSceneName(base, exceptId) {
    const taken = new Set(this.__scenes.filter((s) => s.id !== exceptId).map((s) => s.name));
    if (!taken.has(base)) return base;
    return this._uniqueName(base, taken);
  }

  // Create a pulse object in the authored scene.
  createObject(opts = {}) {
    // One metronome per scene: a metronome INSTANCE (not the global prototype) is the scene's
    // bpm master, so a second placed metronome is ambiguous. Reject it loudly. (Prototypes are
    // global templates, not "in a scene", so they never count toward this.)
    if ((opts.kind === 'metronome') && !opts.isPrototype && this._metronomeInstances().length >= 1) {
      throw new Error('Rhythm Space: a scene may contain only one metronome.');
    }
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
    if (this.__suspendDirty) return;   // scene switch re-instantiates instances; that's not an edit
    if (this.onSceneDirty) this.onSceneDirty();
  }

  // Metronome instances placed in the active scene (excludes the global prototype). The
  // scene invariant is at most one; _findMaster prefers it as the bpm master.
  _metronomeInstances() {
    return this.__objects.filter((o) => o.kind === 'metronome' && !o.isPrototype);
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

  // Create a brand-new prototype from scratch (the object editor's "new prototype" button).
  // A plain pulse object flagged as a prototype, placed at canvas centre and auto-selected
  // for editing; the author then sets its type/sound/etc. via the dropdown. Defaults to the
  // neutral 'target' stub (a valid taxonomy type that renders as a plain circle) rather than a
  // deprecated kind. Lives in the global prototype library (OBJECTS mode).
  createPrototype(opts = {}) {
    const gs = this.gameSession;
    const o = this.createObject({
      name: opts.name || 'prototype',
      isPrototype: true,
      kind: opts.kind || 'target',
      type: opts.type || 'target',
      x: opts.x ?? (gs.canvasWidth / 2),
      y: opts.y ?? (gs.canvasHeight / 2),
      bpm: 100,
      sound: 'none',
    });
    this.layoutPrototypes();   // give the new prototype a slot and keep them all on screen
    return o;
  }

  // Ensure every prototype is on screen in the object editor WITHOUT disturbing manual
  // arrangement: a prototype already sitting on a clear on-screen spot keeps its X/Y (drag to
  // organize — it sticks), and only off-screen or overlapping ones drop into the next free grid
  // slot. Called when the object editor opens and when a prototype is created. Prototype X/Y is
  // presentational, used ONLY in object mode (instances place themselves; asteroids spawn from
  // properties), so this never affects gameplay.
  layoutPrototypes() {
    const gs = this.gameSession;
    if (!gs.canvasWidth) return;
    const protos = this.prototypes;
    if (!protos.length) return;
    const left = 90, top = 130, cell = 150;
    const right = gs.canvasWidth - 330;   // clear the 300px editor panel
    const cols = Math.max(1, Math.floor((right - left) / cell) + 1);
    const onScreen = (o) => o.x >= 40 && o.x <= gs.canvasWidth - 300 && o.y >= 70 && o.y <= gs.canvasHeight - 20;
    const near = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) < cell * 0.6;

    const placed = [];
    const homeless = [];
    for (const o of protos) {
      if (onScreen(o) && !placed.some((q) => near(o.x, o.y, q.x, q.y))) placed.push(o);
      else homeless.push(o);
    }
    let slot = 0;
    for (const o of homeless) {
      let x, y;
      do {
        x = left + (slot % cols) * cell;
        y = top + Math.floor(slot / cols) * cell;
        slot++;
      } while (placed.some((q) => near(x, y, q.x, q.y)) && slot < cols * 200);
      o.x = x; o.y = y;
      placed.push(o);
    }
  }

  // Remove and return a retained (deleted) prototype template of the given kind, or null.
  // Used to restore an essential prototype (e.g. the ship) into the live library.
  takeRetainedByKind(kind) {
    const i = this.__retainedPrototypes.findIndex((r) => r.kind === kind);
    if (i < 0) return null;
    const [rec] = this.__retainedPrototypes.splice(i, 1);
    return rec;
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
    this.__previews = [];               // drop any editor projectile preview on a mode change
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

  // Toggle an object's prototype flag (the editor's PROTOTYPE checkbox). Checking it while
  // editing a scene object PROMOTES it to a global prototype: it leaves the scene (serialize
  // partitions by isPrototype; switchScene keeps prototypes in __objects), joins the prototype
  // library shown in OBJECTS mode, and drops its instance links so it's a clean template.
  // Renaming applies/strips the "p_" prefix. Notifies so the scene's object list drops it.
  setPrototype(obj, isProto) {
    obj.isPrototype = !!isProto;
    if (obj.isPrototype) { obj.prototypeId = null; obj.overrides = null; }
    this.renameObject(obj, obj.name);   // marks dirty
    if (obj === this.ship && obj.isPrototype) this.ship = this._findShip();   // a prototype isn't the live ship
    if (this.onObjectsChange) this.onObjectsChange();
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
    // Only obj-N ids are valid; anything else (e.g. a legacy "undefined" key) gets a fresh one.
    const m = id && /^obj-(\d+)$/.exec(id);
    if (m) {
      this.__idSeq = Math.max(this.__idSeq, Number(m[1]));
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

  // The live ship to drive. Prefer a placed INSTANCE (the gameplay ship); fall back to a ship
  // prototype only if no instance exists — a prototype is hidden in game/editor, so it must
  // never win over an instance (see ensureGameShip, which spawns an instance when needed).
  _findShip() {
    const coll = this.objects;
    let proto = null;
    for (let i = coll.length - 1; i >= 0; i--) {
      if (coll[i].kind !== 'ship') continue;
      if (!coll[i].isPrototype) return coll[i];
      if (!proto) proto = coll[i];
    }
    return proto;
  }

  // Persistable state: the GLOBAL prototypes (keyed by id), the retained prototype templates,
  // and every SCENE with its own instances (keyed by id) — the active scene serialized live,
  // inactive scenes from their parked records. activeScene names the tab to reopen on load.
  // (Legacy saves had a flat 'objects' section instead — see the app's loader, which splits it
  // into prototypes + a single scene.)
  serialize() {
    const prototypes = {};
    const activeObjects = {};
    for (const o of this.__objects) {
      if (o.isPrototype) prototypes[o.id] = this._record(o);
      else activeObjects[o.id] = this._record(o);
    }
    const scenes = this.__scenes.map((s) => ({
      id: s.id,
      name: s.name,
      playOrder: s.playOrder,
      objects: s.id === this.__activeSceneId ? activeObjects : this._parkedObjects(s.id),
    }));
    return {
      prototypes,
      retainedPrototypes: this.__retainedPrototypes,
      scenes,
      activeScene: this.__activeSceneId,
    };
  }

  // Parked records for an inactive scene, keyed by id (they're already _record()-processed).
  _parkedObjects(id) {
    const out = {};
    for (const rec of (this.__sceneStore.get(id) || [])) out[rec.id] = rec;
    return out;
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
    if (this.selected) this.deleteObject(this.selected);
  }

  // Remove a specific object from the working set (the active scene's instances, plus the
  // global prototypes). Scene-object deletion (the editor's per-instance delete buttons)
  // routes here; only instances live in a scene, so that path only ever passes instances.
  deleteObject(obj) {
    if (!obj) return;
    // A deleted prototype leaves its template behind, so the type stays selectable in
    // the create dropdown and survives the save. Newest wins on a name clash.
    if (obj.isPrototype) this._retainPrototype(obj);
    const coll = this.objects;
    const i = coll.indexOf(obj);
    if (i < 0) return;
    coll.splice(i, 1);
    if (obj === this.ship) this.ship = null;
    if (obj === this.selected) {
      this.selected = null;
      if (this.onSelectionChange) this.onSelectionChange();
    }
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
      if (this._hiddenInMode(o)) continue;   // can't grab what isn't drawn
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

  // Which objects are hidden (not rendered / updated / selectable) in the current mode.
  // `modes` is set by the app; before it exists nothing is hidden.
  _hiddenInMode(o) {
    const mode = this.modes && this.modes.current;
    // OBJECTS mode is the global prototype library: ONLY prototypes appear and are editable
    // there. Placed instances live in scenes, so they're hidden here (seen in editor/game).
    if (mode === 'objects') return !o.isPrototype;
    // In a scene (editor/game), a prototype is a template, not scene content — hidden. So
    // converting a scene object to a prototype immediately removes it from the scene view
    // (it stays a global prototype, editable in OBJECTS mode).
    if (o.isPrototype) return true;
    if (mode !== 'game') return false;   // editor mode shows the scene's instances
    // Real game play — also hide design-only kinds: the metronome (beat reference) and
    // projectile definitions (a fired-from template). A consumed launcher (lifespan spent) is
    // gone too, and a "spawn at launch" object stays hidden until the music drops (the launch).
    return o.kind === 'metronome' || o.kind === 'projectile' || o.__expired
      || (o.spawnAtLaunch && !this.__musicDropped);
  }

  update() {
    this._publishGrid();                  // master metronome sets the shared tempo first
    this.moveShip();
    this.syncInstancesFromPrototypes();   // instances honor their prototype each frame
    if (this.mode === 'game') this._collectLaunchers();   // ship picks up downbeat launchers it touches
    for (const o of this.objects) { if (this._hiddenInMode(o)) continue; o.update(); }
    for (let i = this.__previews.length - 1; i >= 0; i--) {
      if (!this.__previews[i].update()) this.__previews.splice(i, 1);   // flew off / lifetime spent
    }
  }

  // Fire a sample projectile from the projectile editor to preview its rotation, speed and
  // lifetime (called when those change). Uses the definition's own appearance; never explodes
  // or collides (preview flag). Launches straight up from the lower-centre so it's visible, and
  // replaces any prior preview so rapid edits don't pile up. Owned here so it renders in any mode.
  previewProjectile(o) {
    if (!o || o.kind !== 'projectile') return;
    const gs = this.gameSession;
    const def = {
      shape: o.shape, fill: o.fill, size: o.size, color: o.color, speed: o.speed,
      explodes: false, aoeRadius: o.aoeRadius, lifetime: o.lifetime,
      spinSpeed: o.spinSpeed, beatpulse: o.beatpulse, launcherPulseScale: 1, preview: true,
    };
    const from = { x: gs.canvasWidth / 2, y: gs.canvasHeight * 0.8 };
    this.__previews = [new Projectile(gs, from, -Math.PI / 2, def)];   // straight up
  }

  // ---- Per-feature effect previews (object editor "preview" buttons) ------
  // Each plays one dynamic behaviour once, in the editor, without entering game mode.

  // Pulse: force one throb on the selected object now (it eases back via relax).
  previewPulse(o) {
    if (o) o.__scale = o.pulseScale;
  }

  // Drift + spin + pulse: spawn one sample rock from an obstacle definition, drifting from
  // lower-centre so its motion is visible. Removed when it drifts off-screen.
  previewObstacle(o) {
    if (!o || o.kind !== 'obstacle') return;
    const gs = this.gameSession;
    const from = { x: gs.canvasWidth / 2, y: gs.canvasHeight * 0.6 };
    this.__previews = [new Asteroid(gs, this._obstacleDef(o), from.x, from.y)];
  }

  // Spawn-on-destroy: spawn one rock of the obstacle's `spawns` target, so you see what it
  // drops. No-op for 'none' or an unresolvable target.
  previewSpawn(o) {
    if (!o || o.kind !== 'obstacle' || o.spawns === 'none') return;
    const def = this.obstacleDef(o.spawns);
    if (!def) return;
    const gs = this.gameSession;
    const from = { x: gs.canvasWidth / 2, y: gs.canvasHeight * 0.6 };
    this.__previews = [new Asteroid(gs, def, from.x, from.y)];
  }

  // Sequencer 'fire' event: fire the object's projectile once from its position, as a preview
  // (no collision/damage). Used by the sequencer's event preview when event is 'fire'.
  previewLauncherFire(o) {
    if (!o) return;
    const gs = this.gameSession;
    const def = this.projectileDef(o.projectile);
    const origin = typeof o.worldOrigin === 'function' ? o.worldOrigin() : { x: o.x, y: o.y };
    this.__previews = [new Projectile(gs, origin, -Math.PI / 2, { ...def, explodes: false, preview: true })];
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

  // The bpm master: a metronome INSTANCE placed in the active scene wins (the scene's own
  // tempo), else the global metronome prototype (the default beat reference). At most one
  // instance exists per scene (enforced in createObject).
  _findMaster() {
    const ms = this.__objects.filter((o) => o.kind === 'metronome');
    return ms.find((o) => !o.isPrototype) || ms[0] || null;
  }

  // Change an object's high-level type (from the editor's type dropdown), updating its kind
  // to the type's canonical kind so rendering/behaviour follow. A launcher keeps its current
  // launcher kind (preserving a four-measure preset); everything else takes the canonical
  // kind. Kind-specific fields already exist on every PulseObject (defaults), so no re-init.
  convertType(o, type) {
    // One metronome instance per scene (see createObject): block converting a second object
    // into a metronome. Prototypes are global templates, so the limit is on instances only.
    if (type === 'metronome' && !o.isPrototype && this._metronomeInstances().some((m) => m !== o)) {
      throw new Error('Rhythm Space: a scene may contain only one metronome.');
    }
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

  // The obstacle (asteroid) prototypes — the templates the AsteroidManager builds waves from.
  obstaclePrototypes() {
    return this.__objects.filter((o) => o.kind === 'obstacle' && o.isPrototype);
  }

  // Plain asteroid definitions for wave spawning (one per obstacle prototype).
  obstacleDefs() {
    return this.obstaclePrototypes().map((o) => this._obstacleDef(o));
  }

  // Resolve an obstacle by its bare (prefix-free) name to a definition — the on-destroy
  // `spawns` target. Prefers an obstacle prototype; null if the name resolves to nothing.
  obstacleDef(name) {
    const matches = this.__objects.filter((o) => o.kind === 'obstacle' && this._bareName(o.name) === name);
    const o = matches.find((x) => x.isPrototype) || matches[0];
    return o ? this._obstacleDef(o) : null;
  }

  _obstacleDef(o) {
    return {
      name: this._bareName(o.name), size: o.size, color: o.color,
      driftMin: o.driftMin, driftMax: o.driftMax, spinMin: o.spinMin, spinMax: o.spinMax,
      pulseScale: o.pulseScale, relax: o.relax, division: o.division,
      spawns: o.spawns, spawnProbability: o.spawnProbability,
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
    for (const o of this.objects) { if (this._hiddenInMode(o)) continue; o.render(); }
    for (const p of this.__previews) p.render();   // editor projectile previews (above the objects)
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
// NOTE: `spawnAtLaunch` is intentionally NOT inherited — it's a per-instance placement flag
// (does THIS placed object wait for the launch), like x/y. Inheriting it meant a non-overridden
// instance got reset to the prototype's value by syncInstancesFromPrototypes each frame, so a
// scene object's "spawn at launch" wouldn't stick. New instances still snapshot the prototype's
// value at creation (createFromPrototype copies serialize()), then own it.
RtdManager.INHERITED = ['radius', 'color', 'bpm', 'pulseScale', 'relax', 'sound', 'behavior', 'volume', 'muted', 'division', 'phaseOffset', 'timeSignature', 'projectile', 'patternMeasures', 'patternSteps', 'event', 'granularity', 'attachPoint', 'lifespanPhrases', 'shape', 'fill', 'size', 'speed', 'explodes', 'aoeRadius', 'lifetime', 'spinSpeed', 'beatpulse', 'driftMin', 'driftMax', 'spinMin', 'spinMax', 'spawns', 'spawnProbability'];

// Beats per bar from an "n/d" time-signature string (the numerator); 4 by default.
RtdManager.beatsPerBar = (sig) => {
  const n = parseInt(String(sig || '4/4').split('/')[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
};
