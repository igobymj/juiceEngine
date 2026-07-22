/*
 * RTD — a new game, scaffolded as a juiceEngine app.
 *
 * This is a blank-but-working starter: a placeholder scene plus a single
 * 'click' juice event so the juice/sound editors have something to drive. Build
 * the actual game out inside build(gs) — add managers, systems, input, and a
 * juice/particle seed the same way burst / asteroids / primitives do.
 */

import System from "../engine/System.js";
import SynthSound from "../engine/sounds/SynthSound.js";

let savedJuice = null;   // persisted RTD juice, loaded before build
export function setSavedJuice(data) { savedJuice = data; }

// Placeholder scene — replace with the real game's render/update systems.
class Placeholder extends System {
  render() {
    const p = this.gameSession.p5;
    const cx = this.gameSession.canvasWidth / 2;
    const cy = this.gameSession.canvasHeight / 2;
    p.push();
    p.noStroke();
    p.fill(232, 228, 218);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(34);
    p.text('RTD', cx, cy - 12);
    p.fill(150, 148, 140);
    p.textSize(14);
    p.text('new game — click to test juice, then build it out', cx, cy + 24);
    p.pop();
  }
}

export default {
  id: 'rtd',
  title: 'RTD',
  background: '#141018',

  build(gs) {
    // --- juice seed (overlaid by saved settings) --------------------------
    gs.juiceSettings.extend({
      cheats: { juiceFx: true },
      click: {
        shake: {
          active: true, xAxis: true, yAxis: true,
          amplitude: 0.4, frequency: 10, duration: 0.3,
          form: 'sine', fade: 'exponential', inheritVelocity: false,
        },
        particles: { active: true, particleSystem: 'rtdBurst' },
        sound: { active: true, synth: 'blip', clip: 'none', volume: -8, rate: 1 },
      },
    });
    gs.juiceSettings.extendParticleSystems({
      rtdBurst: {
        vectorParticle: {
          shape: 'circle', count: 12, size: 5, pattern: 'radial',
          rotation: 'random', rotationSpeed: 4, particleLife: 0.9,
          initialVelocityRandom: true, initialVelocity: 40, fade: true,
          followObject: false, inheritVelocity: false, gravity: false,
          fill: true, color: '#8b7bd8',
        },
      },
    });
    if (savedJuice) {
      if (savedJuice.container) gs.juiceSettings.extend(savedJuice.container);
      if (savedJuice.particleSystems) gs.juiceSettings.extendParticleSystems(savedJuice.particleSystems);
    }

    gs.soundManager.registerSound('blip', new SynthSound(gs, { note: 'D3', volume: -6 }));

    const scene = new Placeholder(gs);
    gs.gameLoop.addUpdateSystem('scene', scene, 50);
    gs.gameLoop.addRenderSystem('scene', scene, 50);

    gs.inputManager.addMouseHandler({
      mousePressed(x, y) {
        gs.juiceEventManager.addNew('click', { position: { x, y }, velocity: { x: 0, y: 0 } });
      },
    });
  },
};
