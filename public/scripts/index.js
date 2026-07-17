/*
 * juiceEngine — demo project.
 *
 * Shows the whole shell: createGame() boots; a DemoTarget system draws a shape
 * from live-editable params; a ModeManager gates per-mode HUD systems and shows
 * the editor panel only in 'tune'; a SettingsEditor tunes the target (and saves
 * to /api/config/demo); the JuiceEditor tunes the click burst.
 *
 * Everything under public/scripts/engine is app-agnostic — this file is the
 * whole project.
 */

import createGame from "./engine/createGame.js";
import System from "./engine/System.js";
import ModeManager from "./engine/ModeManager.js";
import JuiceEditor from "./editor/JuiceEditor.js";
import SettingsEditor from "./editor/SettingsEditor.js";

const PANEL_WIDTH = 300;
const TAB_H = 44;

function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

// Live-editable target params (edited by the SettingsEditor below).
const demoParams = { radius: 40, hue: 40, filled: true };

// Content system: a shape drawn from demoParams + a prompt. Always on.
class DemoTarget extends System {
  render() {
    const p = this.gameSession.p5;
    const cx = (this.gameSession.canvasWidth) / 2;
    const cy = this.gameSession.canvasHeight / 2;
    p.push();
    p.colorMode(p.HSB, 360, 100, 100);
    if (demoParams.filled) { p.noStroke(); p.fill(demoParams.hue, 55, 92); }
    else { p.noFill(); p.stroke(demoParams.hue, 55, 92); p.strokeWeight(3); }
    p.circle(cx, cy, demoParams.radius * 2);
    p.pop();
    p.push();
    p.noStroke(); p.fill(150, 148, 140);
    p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
    p.text('click anywhere to burst · tune tab to edit', cx, cy + demoParams.radius + 26);
    p.pop();
  }
}

// Per-mode HUD text — demonstrates ModeManager gating (only one runs at a time).
class HudText extends System {
  constructor(gs, text) { super(gs); this.text = text; }
  render() {
    const p = this.gameSession.p5;
    p.push();
    p.noStroke(); p.fill(120, 118, 112);
    p.textAlign(p.LEFT, p.TOP); p.textSize(13);
    p.text(this.text, 14, TAB_H + 6);
    p.pop();
  }
}

let modes;   // assigned in build(); referenced by pointerGuard

const gameSession = createGame({
  parent: 'canvas',
  background: '#14131a',
  pointerGuard: (x, y) =>
    y < TAB_H || (modes && modes.current === 'tune' && x > window.innerWidth - PANEL_WIDTH),
  build(gs) {
    // Juice defaults (juice.json overlays these after boot).
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

    // Systems.
    const target = new DemoTarget(gs);
    gs.gameLoop.addUpdateSystem('target', target, 50);
    gs.gameLoop.addRenderSystem('target', target, 50);

    const playHud = new HudText(gs, 'play');
    const tuneHud = new HudText(gs, 'tune — editing');
    gs.gameLoop.addRenderSystem('playHud', playHud, 250);
    gs.gameLoop.addRenderSystem('tuneHud', tuneHud, 250);

    // Modes: HUDs are gated; DemoTarget + click stay always-on (not in any mode).
    modes = new ModeManager(gs);
    modes.define('play', { systems: [playHud] });
    modes.define('tune', { systems: [tuneHud] });
    modes.bindTabs('#mode-tabs');
    modes.set('play');

    gs.inputManager.addMouseHandler({
      mousePressed(x, y) {
        gs.juiceEventManager.addNew('click', { position: { x, y }, velocity: { x: 0, y: 0 } });
      },
    });
  },
});

// Restore any saved target params, then mount the settings editor.
try {
  const res = await fetch('public/scripts/data/demo.json');
  if (res.ok) Object.assign(demoParams, await res.json());
} catch (e) { /* no saved params */ }

new SettingsEditor(document.getElementById('settings-panel'), {
  title: 'Demo',
  sections: [{
    title: 'Target',
    target: demoParams,
    params: [
      { key: 'radius', type: 'range', min: 20, max: 140, step: 1 },
      { key: 'hue', type: 'range', min: 0, max: 360, step: 1 },
      { key: 'filled', type: 'bool' },
    ],
  }],
  save: { name: 'demo', getState: () => demoParams },
});

// Restore saved juice, then mount the juice editor.
try {
  const res = await fetch('public/scripts/data/juice.json');
  if (res.ok) {
    const data = await res.json();
    if (data && data.container) gameSession.juiceSettings.extend(data.container);
    if (data && data.particleSystems) gameSession.juiceSettings.extendParticleSystems(data.particleSystems);
  }
} catch (e) { /* keep defaults */ }

new JuiceEditor(gameSession.juiceSettings, document.getElementById('juice-panel'));
