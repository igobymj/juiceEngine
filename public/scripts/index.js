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
import FoldMenu from "./editor/FoldMenu.js";
import SynthSound from "./engine/sounds/SynthSound.js";
import SampleSoundObject from "./engine/sounds/SampleSoundObject.js";
import DefaultBullet from "./engine/sounds/DefaultBullet.js";
import AlternateBullet from "./engine/sounds/AlternateBullet.js";
import DefaultExplosion from "./engine/sounds/DefaultExplosion.js";

const PANEL_WIDTH = 300;

// Procedural (synth) sounds this project registers, and audio clips found in
// media/sounds (fetched below). These feed the sound menu's two dropdowns.
// bullet/altBullet/explosion are harvested from juicyRocks.
const SYNTHS = ['blip', 'bullet', 'altBullet', 'explosion'];
let clipFiles = [];

function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

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
    // Two independent foldable menus in the right-edge editor. Dirty is tracked
    // per menu — editing juice lights only the juice save, editing sound only
    // the sound save. Save writes the whole shared container (so it persists
    // everything and clears both), but each header only lights for its own edits.
    const editor = document.getElementById('editor');
    editor.innerHTML = '';

    const juiceFold = new FoldMenu(editor, 'juice', { open: true, save: true });
    const soundFold = new FoldMenu(editor, 'sound', { open: true, save: true });

    const juiceEd = new JuiceEditor(gs.juiceSettings, juiceFold.body, {
      exclude: ['sound'], heading: false, save: false,
      onChange: () => juiceFold.setDirty(true),
    });
    new JuiceEditor(gs.juiceSettings, soundFold.body, {
      only: ['sound'], heading: false, save: false,
      onChange: () => soundFold.setDirty(true),
      optionSources: {
        synths: () => SYNTHS,
        clips: () => ['none', ...clipFiles],
      },
    });

    const saveAll = async () => {
      await juiceEd.save();
      juiceFold.setDirty(false);
      soundFold.setDirty(false);
    };
    juiceFold.onSave = saveAll;
    soundFold.onSave = saveAll;
  },
  onDeactivate() {
    document.getElementById('editor').innerHTML = '';
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

let shell;
shell = new AppShell({
  parent: 'canvas',
  apps: [burst, orbit],
  tabs: '#game-tabs',
  initial: 'burst',
  // Canvas coords are relative to the stage (below the tab bar), so a click on
  // the tabs reads as y < 0. Also drop clicks on the editor while burst active.
  pointerGuard: (x, y, gs) =>
    y < 0 || (shell && shell.activeId === 'burst' && x > gs.canvasWidth - PANEL_WIDTH),
});
