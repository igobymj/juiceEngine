/*
 * juiceEngine — multi-app demo.
 *
 * Two entirely separate games behind the tab bar, each its own GameSession
 * (own loop, managers, juice settings, systems), sharing only the canvas:
 *
 *   burst — click to fire a juice burst; tune it live in the panel (its juice
 *           settings persist across tab switches because the session is kept).
 *   orbit — a shape orbiting the centre; click reverses its direction.
 *
 * AppShell owns the canvas and ticks only the active app. This is the layer
 * above ModeManager: different applications, not different modes of one app.
 */

import AppShell from "./engine/AppShell.js";
import SoundManager from "./engine/Managers/SoundManager.js";
import System from "./engine/System.js";
import JuiceEditor from "./editor/JuiceEditor.js";
import ExtrasEditor from "./editor/ExtrasEditor.js";
import FoldMenu from "./editor/FoldMenu.js";
import SynthSound from "./engine/sounds/SynthSound.js";
import SampleSoundObject from "./engine/sounds/SampleSoundObject.js";
import DefaultBullet from "./engine/sounds/DefaultBullet.js";
import AlternateBullet from "./engine/sounds/AlternateBullet.js";
import DefaultExplosion from "./engine/sounds/DefaultExplosion.js";
import { registerToneSynths } from "./engine/sounds/toneSynths.js";
import primitivesApp, { setSavedJuice as setPrimJuice, pointerGuard as primPointerGuard } from "./apps/primitives.js";
import asteroidsApp, { setSavedJuice as setAstJuice, extraApply as astExtraApply } from "./apps/asteroids.js";
import rtdApp, { setSavedState as setRtdState, setSavedJuice as setRtdJuice, pointerGuard as rtdPointerGuard, extraApply as rtdExtraApply } from "./apps/rhythmSpace.js";
import RtdEditor from "./editor/RtdEditor.js";
import { loadSvg, normalizeShapes, svgToVectorObjects } from "./engine/loaders/SvgImport.js";

const PANEL_WIDTH = 300;

// Audio clips found in media/sounds (fetched below). The sound menu's synth
// list comes from each session's registered sounds; the clip list from here.
let clipFiles = [];

// Music tracks found in media/music (fetched below), exposed as the RTD extras
// music-track dropdown. Options: a 'None' entry plus one per file.
let musicFiles = [];
const musicTrackOptions = () => [
  { value: 'none', label: 'None' },
  ...musicFiles.map((f) => ({
    value: 'media/music/' + f,
    // Readable label: drop extension and any trailing "_<digits>", underscores→spaces.
    label: f.replace(/\.[^.]+$/, '').replace(/_\d+$/, '').replace(/_/g, ' '),
  })),
];

function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

// Mount the juice + sound fold editors into the right-edge #editor, bound to the
// active app's own juiceSettings. Available for every app (primitives uses its
// own UI, so #editor is hidden there). `saveName` keeps each app's persistence
// separate (default → juice.json; else /api/config/<saveName>.json).
function mountEditors(gs, saveName, extras, opts = {}) {
  const editor = document.getElementById('editor');
  editor.innerHTML = '';

  // App-specific sections above the shared folds (RTD mounts an 'objects' fold
  // here so editor mode can add prototype instances). Runs first so it sits on top.
  if (opts.prepend) opts.prepend(editor);

  const juiceFold = new FoldMenu(editor, 'juice', { open: false, save: true });
  const soundFold = new FoldMenu(editor, 'sound', { open: false, save: true });

  // Adjusting any control replays the edited event at canvas center as a live
  // preview — hear the sound / see the burst without leaving the panel.
  const preview = (eventName) => {
    gs.juiceEventManager.addNew(eventName, {
      position: { x: gs.canvasWidth / 2, y: gs.canvasHeight / 2 },
      velocity: { x: 0, y: 0 },
    });
  };

  const juiceEd = new JuiceEditor(gs.juiceSettings, juiceFold.body, {
    exclude: ['sound'], heading: false, save: false, saveName,
    onChange: () => juiceFold.setDirty(true),
    onPreview: preview,
  });
  new JuiceEditor(gs.juiceSettings, soundFold.body, {
    only: ['sound'], heading: false, save: false, saveName,
    onChange: () => soundFold.setDirty(true),
    onPreview: preview,
    optionSources: {
      synths: () => gs.soundManager.names().filter((n) => !clipFiles.includes(n)),
      clips: () => ['none', ...clipFiles],
    },
  });

  // Third fold: non-event "extras" (music, colors, cheats, toggles). Always
  // present; shows an empty state when the active game registered none. Extras
  // live in the same container, so they persist via the shared save; this
  // editor only reports dirtiness and runs any per-change side effects.
  const extrasFold = new FoldMenu(editor, 'extras', { open: false, save: true });
  new ExtrasEditor(gs.juiceSettings, extrasFold.body, {
    schema: (extras && extras.schema) || {}, heading: false,
    optionSources: extras && extras.optionSources,
    onApply: extras && extras.onApply,
    onChange: () => extrasFold.setDirty(true),
  });

  const saveAll = async () => {
    await juiceEd.save();
    juiceFold.setDirty(false);
    soundFold.setDirty(false);
    extrasFold.setDirty(false);
  };
  juiceFold.onSave = saveAll;
  soundFold.onSave = saveAll;
  extrasFold.onSave = saveAll;
}

/* ---------- app: burst ---------- */

class BurstTarget extends System {
  render() {
    const p = this.gameSession.p5;
    const cx = this.gameSession.canvasWidth / 2;
    const cy = this.gameSession.canvasHeight / 2;
    p.push();
    p.noStroke();
    p.fill(230, 226, 216);
    p.circle(cx, cy, 76);
    p.fill(150, 148, 140);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.text('click anywhere — tune the burst on the right', cx, cy + 66);
    p.pop();
  }
}

// Optionally overlay the persisted juice settings (loaded before the shell).
let savedJuice = null;

const burst = {
  id: 'burst',
  title: 'burst',
  background: '#14131a',
  // Game-specific "extras" — non-event settings this app exposes in the extras
  // fold. Owned by the app, not the shell; apps that declare none get no fold.
  extras: {
    schema: {
      cheats: { label: 'cheats', params: [{ key: 'juiceFx', type: 'bool' }] },
      sillyColors: {
        label: 'silly colors',
        params: [
          { key: 'active', type: 'bool' },
          { key: 'particleHue', type: 'range', min: 0, max: 360, step: 1, preview: 'hue' },
        ],
      },
    },
  },
  build(gs) {
    gs.juiceSettings.extend({
      cheats: { juiceFx: true },
      sillyColors: { active: false, particleHue: 0 },
      click: {
        shake: {
          active: true, xAxis: true, yAxis: true,
          amplitude: 0.5, frequency: 10, duration: 0.35,
          form: 'sine', fade: 'exponential', inheritVelocity: false,
        },
        particles: { active: true, particleSystem: 'burst' },
        timeSlow: { active: false, scale: 0.4, duration: 0.2 },
        sound: { active: true, synth: 'blip', clip: 'none', volume: -6, rate: 1 },
      },
    });
    gs.juiceSettings.extendParticleSystems({
      burst: {
        vectorParticle: {
          shape: 'circle', count: 14, size: 6, pattern: 'radial',
          rotation: 'random', rotationSpeed: 4, particleLife: 1.0,
          initialVelocityRandom: true, initialVelocity: 42, fade: true,
          followObject: false, inheritVelocity: false, gravity: false,
          fill: false, color: '#ffaa3c',
        },
      },
    });
    if (savedJuice) {
      if (savedJuice.container) gs.juiceSettings.extend(savedJuice.container);
      if (savedJuice.particleSystems) gs.juiceSettings.extendParticleSystems(savedJuice.particleSystems);
    }

    // Register the procedural synth(s) and any audio clips from media/sounds so
    // the 'sound' effect can play them and the editor can list them.
    // toneSynths first so burst's own 'blip' below still wins that name.
    registerToneSynths(gs);
    gs.soundManager.registerSound('blip', new SynthSound(gs, { note: 'C2', volume: -4 }));
    gs.soundManager.registerSound('bullet', new DefaultBullet(gs));
    gs.soundManager.registerSound('altBullet', new AlternateBullet(gs));
    gs.soundManager.registerSound('explosion', new DefaultExplosion(gs));
    for (const f of clipFiles) {
      gs.soundManager.registerSound(f, new SampleSoundObject(gs, 'media/sounds/' + f, { volume: -6 }));
    }

    const target = new BurstTarget(gs);
    gs.gameLoop.addUpdateSystem('target', target, 50);
    gs.gameLoop.addRenderSystem('target', target, 50);

    gs.inputManager.addMouseHandler({
      mousePressed(x, y) {
        gs.juiceEventManager.addNew('click', { position: { x, y }, velocity: { x: 0, y: 0 } });
      },
    });
  },
  onActivate(gs) { mountEditors(gs, undefined, burst.extras); },   // burst persists to juice.json
};

/* ---------- app: orbit ---------- */

class Orbit extends System {
  constructor(gs) { super(gs); this.angle = 0; this.dir = 1; this.svgObjects = null; }
  update() { this.angle += 0.02 * this.dir; }
  reverse() { this.dir *= -1; }
  render() {
    const p = this.gameSession.p5;
    const cx = this.gameSession.canvasWidth / 2;
    const cy = this.gameSession.canvasHeight / 2;
    const r = 130;
    const x = cx + Math.cos(this.angle) * r;
    const y = cy + Math.sin(this.angle) * r;
    p.push();
    p.stroke(90, 120, 170); p.strokeWeight(1); p.noFill();
    p.circle(cx, cy, r * 2);
    p.noStroke();
    p.fill(230, 236, 246); p.circle(x, y, 30);
    p.fill(120, 140, 170); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
    p.text('imported from sample.svg — click to reverse', cx, cy + r + 34);
    p.pop();
    // The imported SVG (vector objects), spinning at centre.
    if (this.svgObjects) {
      for (const o of this.svgObjects) { o.rotation = this.angle * 1.5; o.render(); }
    }
  }
}

const orbit = {
  id: 'orbit',
  title: 'orbit',
  background: '#0e1726',
  build(gs) {
    const o = new Orbit(gs);
    gs.gameLoop.addUpdateSystem('orbit', o, 50);
    gs.gameLoop.addRenderSystem('orbit', o, 50);
    gs.inputManager.addMouseHandler({ mousePressed() { o.reverse(); } });

    // Demo the SVG import pipeline: fetch, sample to point arrays, recentre/
    // scale, build vector objects. Async — they appear once loaded.
    loadSvg('media/svg/sample.svg', { sampleDistance: 2 })
      .then(({ shapes }) => {
        const norm = normalizeShapes(shapes, { targetSize: 150 });
        o.svgObjects = svgToVectorObjects(gs, norm, {
          x: gs.canvasWidth / 2, y: gs.canvasHeight / 2, strokeWeight: 2,
        });
      })
      .catch((e) => console.warn('SVG import failed:', e));
  },
  onActivate(gs) { mountEditors(gs, 'orbit', orbit.extras); },   // its own file, so it can't clobber juice.json
};

/* ---------- shell ---------- */

// Load burst's persisted juice, and enumerate the audio clips, before building.
try {
  const res = await fetch('public/scripts/data/juice.json');
  if (res.ok) savedJuice = await res.json();
} catch (e) { /* defaults */ }
try {
  const res = await fetch('/api/sounds');
  if (res.ok) clipFiles = await res.json();
} catch (e) { /* no clips dir / not dev server */ }
try {
  const res = await fetch('/api/music');
  if (res.ok) musicFiles = await res.json();
} catch (e) { /* no music dir / not dev server */ }
try {
  const res = await fetch('public/scripts/data/primitives.json');
  if (res.ok) setPrimJuice(await res.json());
} catch (e) { /* primitives defaults */ }
try {
  const res = await fetch('public/scripts/data/asteroids.json');
  if (res.ok) setAstJuice(await res.json());
} catch (e) { /* asteroids defaults */ }
try {
  const res = await fetch('public/scripts/data/rtd.json');
  if (res.ok) setRtdState(await res.json());
} catch (e) { /* rtd defaults */ }
try {
  const res = await fetch('public/scripts/data/rtdJuice.json');
  if (res.ok) setRtdJuice(await res.json());
} catch (e) { /* rtd juice defaults */ }

// primitives uses the shared juice/sound editor too (its own juice editor was
// deprecated; the creature editor stays in its own panel).
primitivesApp.onActivate = (gs) => mountEditors(gs, 'primitives', primitivesApp.extras);

// asteroids uses the shared editors; its extras onApply is bound to the session
// here so the session-agnostic extras editor can drive music side effects.
asteroidsApp.onActivate = (gs) => mountEditors(gs, 'asteroids', {
  schema: asteroidsApp.extras.schema,
  onApply: (b, p, v) => astExtraApply(gs, b, p, v),
});

// RTD's right-edge panel depends on the mode: 'objects' shows its own object
// editor (edit prototypes); 'editor' shows an 'objects' fold for adding prototype
// instances above the shared juice/sounds/extras folds, over the running game
// scene; 'game' shows nothing (hidden by CSS). The panel is (re)mounted on every
// mode change and on activation.
const RTD_MODES = ['objects', 'game', 'editor'];
const applyRtdModeClass = (mode) =>
  RTD_MODES.forEach((m) => document.body.classList.toggle('mode-' + m, m === mode));

// (Re)build the scene-tab strip (#rtd-scene-tabs) from the manager's scene list. One tab
// per scene (click to switch), plus a trailing "+" that adds a new scene. Shown only in
// editor mode (CSS). Rebuilt whenever scenes change (add / delete / rename / switch).
function refreshRtdSceneTabs(gs) {
  const nav = document.getElementById('rtd-scene-tabs');
  if (!nav) return;
  const rtd = gs.rtdManager;
  nav.innerHTML = '';
  for (const s of rtd.sceneList()) {
    const b = document.createElement('button');
    b.className = 'scene-tab' + (s.id === rtd.activeSceneId ? ' active' : '');
    b.textContent = s.name;
    b.title = `Switch to ${s.name} (play order ${s.playOrder})`;
    b.addEventListener('click', () => rtd.switchScene(s.id));
    nav.appendChild(b);
  }
  const add = document.createElement('button');
  add.className = 'scene-add';
  add.textContent = '+';
  add.title = 'New scene';
  add.addEventListener('click', () => rtd.addScene('Scene'));
  nav.appendChild(add);
}

// Persist the whole RTD scene (both collections, by instance) to
// public/scripts/data/rtd.json via the dev server. Shared by the objects-mode
// editor and the editor-mode objects fold. Returns true on success.
async function saveRtdScene(gs) {
  const res = await fetch('/api/config/rtd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gs.rtdManager.serialize()),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data.ok !== false;
}

// Editor mode's top fold: place and arrange instances of the objects-mode
// prototypes in the running scene. Prototypes are authored in 'objects' mode;
// here you drop instances (createFromPrototype targets the active 'game'
// collection), then click to select, drag to reposition, and delete. Selecting
// is also where per-object juice settings would hang off once instances carry
// their own (today they inherit everything but position from their prototype).
// Sits above the juice/sound/extras folds; re-renders on selection/object change.
function mountRtdObjectsFold(gs, editorEl, opts = {}) {
  const rtd = gs.rtdManager;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Save writes the scene to rtd.json via the dev server, so it's only offered on
  // localhost (matches the objects-mode editor). The header save appears once a
  // change dirties the scene, and clears on a successful save.
  const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const fold = new FoldMenu(editorEl, 'objects', { open: true, save: isDev });
  if (isDev) {
    fold.onSave = async () => { if (await saveRtdScene(gs)) fold.setDirty(false); };
    rtd.onSceneDirty = () => fold.setDirty(true);   // add / relocate / rename / delete
  }

  const render = () => {
    // Active-scene controls: rename, or delete (kept enabled only while >1 scene exists).
    // Switching scenes is done from the #rtd-scene-tabs strip; the "+" there adds one.
    const scenes = rtd.sceneList();
    const active = scenes.find((s) => s.id === rtd.activeSceneId);
    const sceneHtml = `
      <label style="display:block;">
        <span class="row" style="display:block; margin-bottom:4px;">scene name</span>
        <input type="text" value="${esc(active ? active.name : '')}" data-ctrl="sceneName">
      </label>
      <label style="display:block;">
        <span class="row" style="display:block; margin-bottom:4px;">play order</span>
        <input type="number" step="1" value="${active ? active.playOrder : 0}" data-ctrl="playOrder">
      </label>
      <button data-ctrl="delScene" class="danger"${scenes.length <= 1 ? ' disabled' : ''}>delete scene</button>
      <hr style="border:none; border-top:1px solid rgba(255,255,255,0.08); margin:14px 0;">`;

    // Every prototype is addable to a scene (live ones plus retained templates of deleted
    // prototypes — createFromPrototype stamps from either). Added, it becomes an instance.
    const protos = rtd.prototypeChoices();
    const addHtml = protos.length
      ? `<label>
           <span class="row" style="display:block; margin-bottom:4px;">add instance from prototype</span>
           <select data-ctrl="proto">${protos.map((o) => `<option value="${esc(o.name)}">${esc(o.name)}</option>`).join('')}</select>
         </label>
         <button data-ctrl="add" class="primary">add object</button>`
      : `<p class="hint">No prototypes yet. Create them in objects mode.</p>`;

    // The scene's objects — instances only (prototypes are global, never "in" a scene). Each
    // row selects the object (click the name) and deletes it from the scene (the ✕ button).
    const instances = rtd.objects.filter((o) => !o.isPrototype);
    const listHtml = `<p class="row" style="margin-top:14px; margin-bottom:4px;">objects in scene</p>`
      + (instances.length
        ? `<div class="scene-objs">${instances.map((o) => `
             <div class="scene-obj-row${o === rtd.selected ? ' selected' : ''}">
               <button class="scene-obj-name" data-sel="${esc(o.id)}" title="Select">${esc(o.name)}</button>
               <button class="scene-obj-del danger" data-del="${esc(o.id)}" title="Delete from scene">✕</button>
             </div>`).join('')}</div>`
        : `<p class="hint">No objects in this scene yet. Add one above.</p>`);

    const sel = rtd.selected;
    const selHtml = sel
      ? `<label style="display:block; margin-top:12px;">
           <span class="row" style="display:block; margin-bottom:4px;">name</span>
           <input type="text" value="${esc(sel.name ?? '')}" data-ctrl="name">
         </label>
         <p class="hint">drag on the canvas to reposition</p>
         <div style="display:flex; gap:8px;">
           <button data-ctrl="edit" class="primary" style="flex:1;">edit object</button>
           <button data-ctrl="delete" class="danger" style="flex:1;">delete object</button>
         </div>`
      : '';

    fold.body.innerHTML = sceneHtml + addHtml + listHtml + selHtml;

    fold.body.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => {
      const o = rtd.objects.find((x) => x.id === b.dataset.sel);
      if (o) rtd.select(o);
    }));
    fold.body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const o = rtd.objects.find((x) => x.id === b.dataset.del);
      if (o) rtd.deleteObject(o);   // instances only — prototypes aren't listed here
    }));

    const sceneName = fold.body.querySelector('[data-ctrl="sceneName"]');
    if (sceneName) sceneName.addEventListener('change', (e) => {
      rtd.renameScene(rtd.activeSceneId, e.target.value);
      render();   // reflect any uniquification
    });
    const playOrder = fold.body.querySelector('[data-ctrl="playOrder"]');
    if (playOrder) playOrder.addEventListener('change', (e) => {
      rtd.setScenePlayOrder(rtd.activeSceneId, e.target.value);
      render();   // reflect the coerced integer
    });
    const delScene = fold.body.querySelector('[data-ctrl="delScene"]');
    if (delScene) delScene.addEventListener('click', () => rtd.deleteScene(rtd.activeSceneId));

    const protoSel = fold.body.querySelector('[data-ctrl="proto"]');
    const add = fold.body.querySelector('[data-ctrl="add"]');
    if (add) add.addEventListener('click', () => {
      if (protoSel && protoSel.value) {
        try {
          const obj = rtd.createFromPrototype(protoSel.value, { x: gs.canvasWidth / 2, y: gs.canvasHeight / 2 });
          if (obj) {
            rtd.select(obj);   // re-renders the fold, revealing the instance's name field
            // A new instance is a copy of the prototype (named "<prototype> N"); it must get
            // its own name — focus the name field with the text selected so renaming is the
            // immediate next action.
            const ni = fold.body.querySelector('[data-ctrl="name"]');
            if (ni) { ni.focus(); ni.select(); }
          }
          // Ships build async (no return) and select on canvas click — renamed there instead.
        } catch (err) { window.alert(err && err.message ? err.message : String(err)); }   // one-metronome-per-scene
      }
    });
    const nameInput = fold.body.querySelector('[data-ctrl="name"]');
    if (nameInput) nameInput.addEventListener('change', (e) => {
      rtd.renameObject(sel, e.target.value);
      render();   // reflect any uniquification the manager applied
    });
    const del = fold.body.querySelector('[data-ctrl="delete"]');
    if (del) del.addEventListener('click', () => rtd.deleteSelected());
    // Edit object: bring up the object-editing interface in the right panel, in place (no
    // mode/context switch) — its SAVE returns here (see mountObjectEditor). Instances are all
    // editable there; x/y is per-instance (not inherited), so it stays as placed in the scene.
    const edit = fold.body.querySelector('[data-ctrl="edit"]');
    if (edit) edit.addEventListener('click', () => {
      const obj = rtd.selected;
      if (obj && opts.onEditObject) opts.onEditObject(obj);
    });
  };

  render();
  // Keep the fold in sync as the selection or the object set changes. Editor mode
  // cleared these subscriptions before mounting, so the fold owns them here.
  rtd.onSelectionChange = render;
  rtd.onObjectsChange = render;
}

rtdApp.onActivate = (gs) => {
  const editorEl = document.getElementById('editor');

  const mountObjectsPanel = () => {
    new RtdEditor(gs.rtdManager, editorEl, {
      soundNames: () => gs.soundManager.names(),
      // New objects are copies of the chosen prototype (see RtdManager).
      onCreate: (prototypeName) => gs.rtdManager.createFromPrototype(prototypeName),
      // Persist the scene by instance to public/scripts/data/rtd.json (dev server).
      onSave: () => saveRtdScene(gs),
    });
  };

  // In-place object editing from the scene editor's EDIT OBJECT button: replace the whole
  // editor-mode panel with the full object-editing interface for `obj`, WITHOUT leaving
  // editor mode. Its SAVE button persists the scene and returns to the scene editor
  // (onDone → re-mount the editor-mode panel).
  const mountObjectEditor = (obj) => {
    gs.rtdManager.onSelectionChange = null;   // detach the scene fold's subscriptions
    gs.rtdManager.onObjectsChange = null;
    gs.rtdManager.onSceneDirty = null;
    editorEl.innerHTML = '';
    new RtdEditor(gs.rtdManager, editorEl, {
      soundNames: () => gs.soundManager.names(),
      onSave: () => saveRtdScene(gs),
      onDone: () => mountForMode('editor'),   // SAVE → back to the scene editor
    });
    if (obj) gs.rtdManager.select(obj);       // the editor renders the selected object
  };

  // 'editor' mounts the shared juice/sounds/extras folds. Persists to its own file
  // (rtdJuice.json) so it never collides with the object scene in rtd.json.
  const mountForMode = (mode) => {
    // Detach the object editor's subscriptions so a stale one can't overwrite
    // another mode's panel when objects change.
    gs.rtdManager.onSelectionChange = null;
    gs.rtdManager.onObjectsChange = null;
    gs.rtdManager.onSceneDirty = null;
    if (mode === 'objects') { gs.rtdManager.layoutPrototypes(); mountObjectsPanel(); }   // tidy so every prototype is on screen, then re-subscribe
    else if (mode === 'editor') mountEditors(gs, 'rtdJuice', {
      schema: rtdApp.extras.schema,
      optionSources: { musicTracks: musicTrackOptions },   // enumerated from media/music
      onApply: (b, p, v) => rtdExtraApply(gs, b, p, v),     // music side effects
    }, {
      prepend: (editorEl) => mountRtdObjectsFold(gs, editorEl, { onEditObject: mountObjectEditor }),
    });
    // 'game': panel stays hidden by CSS; leave whatever is mounted.
  };

  const modes = gs.rtdManager.modes;
  applyRtdModeClass(modes.current);   // ModeManager doesn't re-apply on re-activation
  modes.onChange = (name) => { applyRtdModeClass(name); mountForMode(name); refreshRtdSceneTabs(gs); };
  mountForMode(modes.current);

  // Scene tabs live outside the mode panels (their own strip); rebuild on any scene change.
  gs.rtdManager.onScenesChange = () => refreshRtdSceneTabs(gs);
  refreshRtdSceneTabs(gs);
};

// Clear RTD's mode-* body classes when leaving, so 'mode-editor' can't linger
// into another app (e.g. primitives, which also styles on mode-editor).
rtdApp.onDeactivate = () => {
  RTD_MODES.forEach((m) => document.body.classList.remove('mode-' + m));
};

let shell;
shell = new AppShell({
  parent: 'canvas',
  apps: [burst, orbit, primitivesApp, asteroidsApp, rtdApp],
  tabs: '#game-tabs',
  initial: 'rtd',
  // Canvas coords are relative to the stage (below the tab bar), so a click on
  // the tabs reads as y < 0. Each app also drops clicks on its own panels.
  pointerGuard: (x, y, gs) => {
    if (y < 0) return true;
    if (!shell) return false;
    if (shell.activeId === 'primitives') return primPointerGuard(x, y, gs);
    if (shell.activeId === 'rtd') return rtdPointerGuard(x, y, gs);
    // burst & orbit both show the right-edge editor.
    return x > gs.canvasWidth - PANEL_WIDTH;
  },
});

// Global mute — lives in the top tab bar, independent of the active app. Toggles
// Tone's master output (SoundManager.setMuted), so it silences every app at once.
const muteBtn = document.getElementById('mute-toggle');
if (muteBtn) {
  const syncMute = () => {
    const muted = SoundManager.muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.title = muted ? 'Unmute all sound' : 'Mute all sound';
  };
  muteBtn.addEventListener('click', () => { SoundManager.toggleMute(); syncMute(); });
  syncMute();
}
