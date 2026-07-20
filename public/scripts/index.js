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
import System from "./engine/System.js";
import JuiceEditor from "./editor/JuiceEditor.js";
import ExtrasEditor from "./editor/ExtrasEditor.js";
import FoldMenu from "./editor/FoldMenu.js";
import SynthSound from "./engine/sounds/SynthSound.js";
import SampleSoundObject from "./engine/sounds/SampleSoundObject.js";
import DefaultBullet from "./engine/sounds/DefaultBullet.js";
import AlternateBullet from "./engine/sounds/AlternateBullet.js";
import DefaultExplosion from "./engine/sounds/DefaultExplosion.js";
import primitivesApp, { setSavedJuice as setPrimJuice, pointerGuard as primPointerGuard } from "./apps/primitives.js";

const PANEL_WIDTH = 300;

// Audio clips found in media/sounds (fetched below). The sound menu's synth
// list comes from each session's registered sounds; the clip list from here.
let clipFiles = [];

function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

// Mount the juice + sound fold editors into the right-edge #editor, bound to the
// active app's own juiceSettings. Available for every app (primitives uses its
// own UI, so #editor is hidden there). `saveName` keeps each app's persistence
// separate (default → juice.json; else /api/config/<saveName>.json).
function mountEditors(gs, saveName, extras) {
  const editor = document.getElementById('editor');
  editor.innerHTML = '';

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

  // Optional third fold: non-event "extras" (music, colors, cheats, toggles).
  // They live in the same container, so they persist via the shared save; this
  // editor only reports dirtiness and runs any per-change side effects.
  let extrasFold = null;
  if (extras && extras.schema) {
    extrasFold = new FoldMenu(editor, 'extras', { open: false, save: true });
    new ExtrasEditor(gs.juiceSettings, extrasFold.body, {
      schema: extras.schema, heading: false,
      optionSources: extras.optionSources,
      onApply: extras.onApply,
      onChange: () => extrasFold.setDirty(true),
    });
  }

  const saveAll = async () => {
    await juiceEd.save();
    juiceFold.setDirty(false);
    soundFold.setDirty(false);
    if (extrasFold) extrasFold.setDirty(false);
  };
  juiceFold.onSave = saveAll;
  soundFold.onSave = saveAll;
  if (extrasFold) extrasFold.onSave = saveAll;
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
  onActivate(gs) {
    // Demo of the native "extras" editor: non-event blocks burst already seeds
    // (cheats.juiceFx + sillyColors) exposed as an 'extras' fold.
    mountEditors(gs, undefined, {
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
    });
  },
};

/* ---------- app: orbit ---------- */

class Orbit extends System {
  constructor(gs) { super(gs); this.angle = 0; this.dir = 1; }
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
    p.fill(120, 150, 200); p.circle(cx, cy, 26);
    p.fill(230, 236, 246); p.circle(x, y, 30);
    p.fill(120, 140, 170); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
    p.text('a different app entirely — click to reverse', cx, cy + r + 34);
    p.pop();
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
  },
  onActivate(gs) { mountEditors(gs, 'orbit'); },   // its own file, so it can't clobber juice.json
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
  const res = await fetch('public/scripts/data/primitives.json');
  if (res.ok) setPrimJuice(await res.json());
} catch (e) { /* primitives defaults */ }

// primitives uses the shared juice/sound editor too (its own juice editor was
// deprecated; the creature editor stays in its own panel).
primitivesApp.onActivate = (gs) => mountEditors(gs, 'primitives');

let shell;
shell = new AppShell({
  parent: 'canvas',
  apps: [burst, orbit, primitivesApp],
  tabs: '#game-tabs',
  initial: 'burst',
  // Canvas coords are relative to the stage (below the tab bar), so a click on
  // the tabs reads as y < 0. Each app also drops clicks on its own panels.
  pointerGuard: (x, y, gs) => {
    if (y < 0) return true;
    if (!shell) return false;
    if (shell.activeId === 'primitives') return primPointerGuard(x, y, gs);
    // burst & orbit both show the right-edge editor.
    return x > gs.canvasWidth - PANEL_WIDTH;
  },
});
