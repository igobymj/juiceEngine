/*
 * juiceEngine — boot + minimal demo.
 *
 * This is the thin "game" layer: it boots the engine (GameSession + p5 sketch),
 * registers systems on the game loop, seeds a juice event, and mounts the juice
 * editor. Everything under public/scripts/engine is app-agnostic; this file is
 * the only place a new project needs to change.
 *
 * The demo: click anywhere to fire the 'click' juice event (screen shake +
 * particle burst). Open the panel on the right to tune it live and save it.
 *
 * A "system" is any object with update() and/or render(); register it on the
 * loop with a priority (lower = earlier). That is the whole extension model.
 */

import GameSession from "./engine/GameSession.js";
import JuiceEditor from "./editor/JuiceEditor.js";

// Resume audio on first interaction (browser autoplay policy).
function resumeAudio() {
  if (window.Tone) Tone.start();
  document.removeEventListener('click', resumeAudio);
}
document.addEventListener('click', resumeAudio);

const gameSession = new GameSession();
gameSession.backgroundColor = '#14131a';

// Seed the juice settings. juice.json (loaded below) overlays these, so this is
// just the in-code default if the file is missing.
gameSession.juiceSettings.extend({
  cheats: { juiceFx: true },
  // Referenced by the particle effect for optional hue override; stub it so the
  // access never throws.
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
gameSession.juiceSettings.extendParticleSystems({
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

// --- systems ---------------------------------------------------------------

// Input polls held keys each frame and dispatches mouse/key events; runs first.
gameSession.gameLoop.addUpdateSystem('input', gameSession.inputManager, 0);

// Demo content: a target dot + prompt text.
const demo = {
  update() {},
  render() {
    const p = gameSession.p5;
    const cx = (gameSession.canvasWidth - 300) / 2;   // centre of the canvas area
    const cy = gameSession.canvasHeight / 2;
    p.push();
    p.noStroke();
    p.fill(230, 226, 216);
    p.circle(cx, cy, 76);
    p.fill(150, 148, 140);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.text('click anywhere — tune the burst in the juice panel', cx, cy + 70);
    p.pop();
  },
};
gameSession.gameLoop.addUpdateSystem('demo', demo, 50);
gameSession.gameLoop.addRenderSystem('demo', demo, 50);

// Juice runs last so a shake translate lands after everything else and rendered
// effects (particles) layer on top.
gameSession.gameLoop.addUpdateSystem('juice', gameSession.juiceEventManager, 200);
gameSession.gameLoop.addRenderSystem('juice', gameSession.juiceEventManager, 200);

// Clicking fires the 'click' juice event at the pointer.
gameSession.inputManager.addMouseHandler({
  mousePressed(x, y) {
    gameSession.juiceEventManager.addNew('click', {
      position: { x, y },
      velocity: { x: 0, y: 0 },
    });
  },
});

// --- juice editor + persisted settings -------------------------------------

try {
  const res = await fetch('public/scripts/data/juice.json');
  if (res.ok) {
    const data = await res.json();
    if (data && data.container) gameSession.juiceSettings.extend(data.container);
    if (data && data.particleSystems) gameSession.juiceSettings.extendParticleSystems(data.particleSystems);
  }
} catch (e) {
  // No saved file — keep the in-code defaults above.
}

new JuiceEditor(gameSession.juiceSettings, document.getElementById('juice-panel'));

// --- p5 sketch boot --------------------------------------------------------

const sketch = function (p) {
  p.setup = function () {
    const canvasDiv = document.getElementById('canvas');
    gameSession.canvasWidth = canvasDiv.clientWidth;
    gameSession.canvasHeight = canvasDiv.clientHeight;

    const canvas = p.createCanvas(gameSession.canvasWidth, gameSession.canvasHeight);
    canvas.parent('canvas');
    gameSession.canvas = canvas;

    gameSession.timeManager.timeScale = 1;
    gameSession.timeManager.frameRate = 60;
    gameSession.timeManager.start();

    p.frameRate(60);
    p.imageMode(p.CENTER);
  };

  p.draw = function () {
    gameSession.timeManager.update();
    gameSession.gameLoop.update();

    p.background(p.color(gameSession.backgroundColor));
    gameSession.gameLoop.render();

    if (gameSession.flashColor != 0) {
      p.fill(gameSession.flashColor);
      p.rect(0, 0, gameSession.canvasWidth, gameSession.canvasHeight);
    }
  };

  p.mousePressed = function () {
    // Ignore clicks on the right-side juice panel.
    if (p.mouseX > p.windowWidth - 300) return;
    gameSession.inputManager.mousePressed(p.mouseX, p.mouseY);
  };
  p.mouseDragged = function () { gameSession.inputManager.mouseDragged(p.mouseX, p.mouseY); };
  p.mouseReleased = function () { gameSession.inputManager.mouseReleased(); };
  p.keyPressed = function () { gameSession.inputManager.keyInput(p.key); };

  p.windowResized = function () {
    const canvasDiv = document.getElementById('canvas');
    gameSession.canvasWidth = canvasDiv.clientWidth;
    gameSession.canvasHeight = canvasDiv.clientHeight;
    p.resizeCanvas(gameSession.canvasWidth, gameSession.canvasHeight);
  };
};

gameSession.p5 = new p5(sketch, 'canvas');
