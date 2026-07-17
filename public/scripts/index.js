/*
 * juiceEngine — demo project.
 *
 * With createGame() absorbing the boot boilerplate, a project is: define some
 * systems, wire them in build(), and mount whatever UI you want. Everything
 * under public/scripts/engine is app-agnostic.
 *
 * Demo: click anywhere to fire the 'click' juice event (screen shake + particle
 * burst). Tune it live in the panel on the right and save.
 */

import createGame from "./engine/createGame.js";
import System from "./engine/System.js";
import JuiceEditor from "./editor/JuiceEditor.js";

const PANEL_WIDTH = 300;

// Resume audio on first interaction (browser autoplay policy).
function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

// A trivial system, written against the System base to show the pattern:
// a target dot + prompt in the centre of the canvas area.
class DemoTarget extends System {
  render() {
    const p = this.gameSession.p5;
    const cx = (this.gameSession.canvasWidth - PANEL_WIDTH) / 2;
    const cy = this.gameSession.canvasHeight / 2;
    p.push();
    p.noStroke();
    p.fill(230, 226, 216);
    p.circle(cx, cy, 76);
    p.fill(150, 148, 140);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.text('click anywhere — tune the burst in the juice panel', cx, cy + 70);
    p.pop();
  }
}

const gameSession = createGame({
  parent: 'canvas',
  background: '#14131a',
  // Ignore clicks that land on the juice panel.
  pointerGuard: (x) => x > window.innerWidth - PANEL_WIDTH,
  build(gs) {
    // Seed juice defaults (juice.json overlays these after boot).
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

    // Content system.
    const demo = new DemoTarget(gs);
    gs.gameLoop.addUpdateSystem('demo', demo, 50);
    gs.gameLoop.addRenderSystem('demo', demo, 50);

    // Clicking fires the 'click' juice event at the pointer.
    gs.inputManager.addMouseHandler({
      mousePressed(x, y) {
        gs.juiceEventManager.addNew('click', { position: { x, y }, velocity: { x: 0, y: 0 } });
      },
    });
  },
});

// Load persisted juice settings, then mount the editor so its UI reflects them.
try {
  const res = await fetch('public/scripts/data/juice.json');
  if (res.ok) {
    const data = await res.json();
    if (data && data.container) gameSession.juiceSettings.extend(data.container);
    if (data && data.particleSystems) gameSession.juiceSettings.extendParticleSystems(data.particleSystems);
  }
} catch (e) {
  // No saved file — keep the in-code defaults from build().
}

new JuiceEditor(gameSession.juiceSettings, document.getElementById('juice-panel'));
