/*
 * primitives — the primitives game, retrofitted as a juiceEngine app.
 *
 * The whole game is wired in build(gs): its managers, systems, input handlers,
 * modes (editor/play/garden), and side panel. It runs on the shared canvas the
 * AppShell owns, so it does NOT boot p5 and does NOT register the input/juice
 * systems (the shell already does).
 *
 * Its own UI is the mode tabs (#mode-tabs) plus the creature editor
 * (#editor-panel), shown only while this app is active. Juice/sound editing uses
 * the shared right-edge editor (its old #juice-panel editor was deprecated).
 * Mode + panel-region state is exposed via pointerGuard() so the shell can drop
 * clicks that land on this app's tab bar or panels.
 */

import Creature from "../game/Creature.js";
import CreatureManager from "../game/CreatureManager.js";
import FoodManager from "../game/FoodManager.js";
import InkManager, { INK_TYPES } from "../game/InkManager.js";
import GardenScatter from "../game/GardenScatter.js";
import Editor from "../editor/Editor.js";
import { renderText, measureText } from "../game/VectorText.js";
import SynthSound from "../engine/sounds/SynthSound.js";

const MODE_TAB_H = 40;     // primitives' mode tab bar height
const PANEL_WIDTH = 260;   // editor panel width (juice panel is 300)

let savedJuice = null;     // persisted primitives juice, loaded before build
export function setSavedJuice(data) { savedJuice = data; }

let state = null;          // { currentMode } — for the pointer guard

// Drop clicks on this app's mode-tab strip (top of canvas) or its side panel:
// the creature editor (260) in editor mode, else the shared juice/sound editor
// (300) shown for the other modes.
export function pointerGuard(x, y, gs) {
  if (!state) return false;
  if (y < MODE_TAB_H) return true;
  const w = state.currentMode === 'editor' ? PANEL_WIDTH : 300;
  return x > gs.canvasWidth - w;
}

function lineFarEndpointWorld(creature, line) {
  const d1 = line.p1.x * line.p1.x + line.p1.y * line.p1.y;
  const d2 = line.p2.x * line.p2.x + line.p2.y * line.p2.y;
  const tip = d2 >= d1 ? line.p2 : line.p1;
  return { x: creature.position.x + tip.x, y: creature.position.y + tip.y };
}

function strokePath(g, pts) {
  g.beginShape();
  g.curveVertex(pts[0].x, pts[0].y);
  for (const pt of pts) g.curveVertex(pt.x, pt.y);
  const last = pts[pts.length - 1];
  g.curveVertex(last.x, last.y);
  g.endShape();
}
const PEN_NIB = 2.2;
const PEN_SAMPLE_MIN = 2.5;
const PEN_COLOR = [22, 20, 18];
function drawInkStroke(g, pts) {
  const [r, gg, b] = PEN_COLOR;
  g.noFill();
  g.strokeCap(g.ROUND);
  g.strokeJoin(g.ROUND);
  if (pts.length === 1) {
    g.stroke(r, gg, b, 230);
    g.strokeWeight(PEN_NIB);
    g.point(pts[0].x, pts[0].y);
    return;
  }
  g.stroke(r, gg, b, 42);
  g.strokeWeight(PEN_NIB * 2.3);
  strokePath(g, pts);
  g.stroke(r, gg, b, 232);
  g.strokeWeight(PEN_NIB);
  strokePath(g, pts);
}

export default {
  id: 'primitives',
  title: 'primitives',
  background: '#f3ecdc',

  build(gs) {
    let currentMode = 'play';
    state = { get currentMode() { return currentMode; } };

    // --- juice seed (overlaid by saved settings) ---------------------------
    gs.juiceSettings.extend({
      cheats: { juiceFx: true },
      sillyColors: { active: false, particleHue: 0 },
      garden: { zoneJitter: { active: true, amplitude: 1.6, interval: 90 } },
      'line proximity': {
        proximityJitter: { active: true, maxJitter: 1.5, maxAnimationSpeed: 16, effectRadius: 2 },
      },
      'line attaches': {
        shake: {
          active: true, xAxis: true, yAxis: true, amplitude: 0.5,
          frequency: 10, duration: 0.35, form: 'sine', fade: 'exponential', inheritVelocity: false,
        },
        particles: { active: true, particleSystem: 'attachBurst' },
        timeSlow: { active: false, scale: 0.4, duration: 0.2 },
      },
      // Fired by InkManager when a blot splats in garden mode.
      'ink splat': {
        particles: { active: true, particleSystem: 'inkSplat' },
        shake: {
          active: false, xAxis: true, yAxis: true, amplitude: 0.2,
          frequency: 12, duration: 0.2, form: 'sine', fade: 'exponential', inheritVelocity: false,
        },
        sound: { active: false, synth: 'blip', clip: 'none', volume: -8, rate: 1 },
      },
    });
    gs.juiceSettings.extendParticleSystems({
      attachBurst: {
        vectorParticle: {
          shape: 'circle', count: 12, size: 6, pattern: 'radial', rotation: 'random',
          rotationSpeed: 4, particleLife: 1.0, initialVelocityRandom: true, initialVelocity: 35,
          fade: true, followObject: false, inheritVelocity: false, gravity: false, fill: false,
          color: '#ffaa3c',
        },
      },
      inkSplat: {
        vectorParticle: {
          shape: 'circle', count: 8, size: 4, pattern: 'radial', rotation: 'random',
          rotationSpeed: 3, particleLife: 0.6, initialVelocityRandom: true, initialVelocity: 24,
          fade: true, followObject: false, inheritVelocity: false, gravity: false, fill: true,
          color: '#3a2a1a',
        },
      },
    });
    if (savedJuice) {
      if (savedJuice.container) gs.juiceSettings.extend(savedJuice.container);
      if (savedJuice.particleSystems) gs.juiceSettings.extendParticleSystems(savedJuice.particleSystems);
    }

    // --- managers ----------------------------------------------------------
    const creatureManager = new CreatureManager(gs);
    const foodManager = new FoodManager(gs, creatureManager);
    const inkManager = new InkManager(gs);
    inkManager.splatEvent = 'ink splat';   // fire this juice event on each splat
    const gardenScatter = new GardenScatter(gs);

    // A clip the ink-splat sound can use (assignable in the sound editor).
    gs.soundManager.registerSound('blip', new SynthSound(gs, { note: 'C3', volume: -6 }));

    // NB: input (0) and juice (200) are already registered by the shell.
    gs.gameLoop.addUpdateSystem('ink', inkManager, 40);
    gs.gameLoop.addRenderSystem('ink', inkManager, 30);
    gs.gameLoop.addUpdateSystem('gardenScatter', gardenScatter, 42);
    gs.gameLoop.addRenderSystem('gardenScatter', gardenScatter, 35);
    gs.gameLoop.addUpdateSystem('food', foodManager, 50);
    gs.gameLoop.addRenderSystem('food', foodManager, 50);
    gs.gameLoop.addUpdateSystem('creatures', creatureManager, 100);
    gs.gameLoop.addRenderSystem('creatures', creatureManager, 100);

    // --- HUDs --------------------------------------------------------------
    const hudText = (text) => {
      const p = gs.p5;
      const sizePx = 22, margin = 24;
      const x = gs.canvasWidth - measureText(text) * sizePx - margin;
      const y = margin - 6 + MODE_TAB_H;   // below the mode tab strip
      p.push();
      p.resetMatrix();
      p.noFill(); p.stroke(20, 18, 14, 200); p.strokeWeight(1.5);
      p.strokeCap(p.ROUND); p.strokeJoin(p.ROUND);
      renderText(p, text, x, y, sizePx);
      p.pop();
    };
    gs.gameLoop.addRenderSystem('hud', {
      update() {},
      render() {
        if (currentMode !== 'play') return;
        if (!foodManager.items.some((f) => f.active)) return;
        hudText('space to attach');
      },
    }, 250);
    gs.gameLoop.addRenderSystem('gardenHud', {
      update() {},
      render() { if (currentMode === 'garden') hudText('e to plant'); },
    }, 250);

    // --- input -------------------------------------------------------------
    gs.inputManager.addMouseHandler(creatureManager);
    gs.inputManager.addKeyHandler((key) => creatureManager.keyPressed(key));
    gs.inputManager.addKeyHandler((key) => foodManager.keyPressed(key));

    let inkTypeIndex = 0;
    gs.inputManager.addKeyHandler((key) => {
      if (currentMode !== 'garden') return;
      if (key !== 'e' && key !== 'E') return;
      const ink = INK_TYPES[inkTypeIndex % INK_TYPES.length];
      inkTypeIndex++;
      for (const c of creatureManager.creatures) {
        const zone = gardenScatter.zoneAt(c.position.x, c.position.y);
        if (!zone) continue;
        inkManager.plant(c.position.x, c.position.y, ink, c.bodyRadius || 14, undefined, zone);
      }
    });

    const GAMBOGE = INK_TYPES.find((t) => t.name === 'Gamboge') || INK_TYPES[0];
    gs.inputManager.addMouseHandler({
      mousePressed() {
        if (currentMode !== 'garden') return;
        if (gs.p5 && gs.p5.keyIsDown(gs.p5.SHIFT)) return;
        for (const c of creatureManager.creatures) {
          for (const line of c.lines) {
            const pt = lineFarEndpointWorld(c, line);
            const zone = gardenScatter.zoneAt(pt.x, pt.y);
            if (!zone) continue;
            inkManager.plantGrowing(pt.x, pt.y, GAMBOGE, zone);
          }
        }
      },
      mouseReleased() { inkManager.releaseGrowing(); },
    });

    // Pen mode (Shift + WASD draws fountain-pen strokes at line tips).
    let penPrevShift = false;
    const penDrawer = {
      buffer: null, bufW: 0, bufH: 0, completed: [],
      _ensureBuffer(p) {
        const W = gs.canvasWidth, H = gs.canvasHeight;
        if (this.buffer && this.bufW === W && this.bufH === H) return;
        this.bufW = W; this.bufH = H;
        this.buffer = p.createGraphics(W, H);
        for (const pts of this.completed) drawInkStroke(this.buffer, pts);
      },
      update() {
        const p = gs.p5;
        if (!p) return;
        const shift = currentMode === 'garden' && p.keyIsDown(p.SHIFT);
        if (!shift) { if (penPrevShift) this._endStrokes(p); penPrevShift = false; return; }
        penPrevShift = true;
        for (const c of creatureManager.creatures) {
          for (const line of c.lines) {
            const tip = lineFarEndpointWorld(c, line);
            if (!gardenScatter.zoneAt(tip.x, tip.y)) { this._finishLine(p, line); continue; }
            if (!line._penStroke) { line._penStroke = [{ x: tip.x, y: tip.y }]; continue; }
            const last = line._penStroke[line._penStroke.length - 1];
            if (Math.hypot(tip.x - last.x, tip.y - last.y) >= PEN_SAMPLE_MIN) {
              line._penStroke.push({ x: tip.x, y: tip.y });
            }
          }
        }
      },
      _finishLine(p, line) {
        if (line._penStroke && line._penStroke.length) {
          this._ensureBuffer(p);
          this.completed.push(line._penStroke);
          drawInkStroke(this.buffer, line._penStroke);
        }
        line._penStroke = null;
      },
      _endStrokes(p) {
        this._ensureBuffer(p);
        for (const c of creatureManager.creatures) for (const line of c.lines) this._finishLine(p, line);
      },
      render() {
        if (currentMode !== 'garden') return;
        const p = gs.p5;
        if (!p) return;
        this._ensureBuffer(p);
        p.push(); p.imageMode(p.CORNER); p.image(this.buffer, 0, 0); p.pop();
        p.push();
        for (const c of creatureManager.creatures) {
          for (const line of c.lines) {
            if (line._penStroke && line._penStroke.length) drawInkStroke(p, line._penStroke);
          }
        }
        p.pop();
      },
    };
    gs.gameLoop.addUpdateSystem('penDrawer', penDrawer, 45);
    gs.gameLoop.addRenderSystem('penDrawer', penDrawer, 38);

    gs.gameLoop.addUpdateSystem('zoneEligibility', {
      update() {
        if (currentMode !== 'garden') { gardenScatter.updateEligibility([]); return; }
        const points = [];
        for (const c of creatureManager.creatures) {
          points.push({ x: c.position.x, y: c.position.y });
          for (const line of c.lines) points.push(lineFarEndpointWorld(c, line));
        }
        gardenScatter.updateEligibility(points);
      },
      render() {},
    }, 46);

    // --- creatures, editors, modes ----------------------------------------
    function createCreature(x, y) {
      const cx = x ?? (gs.canvasWidth - PANEL_WIDTH) / 2 + (Math.random() - 0.5) * 80;
      const cy = y ?? gs.canvasHeight / 2 + (Math.random() - 0.5) * 80;
      const deformation = creatureManager.mode === 'play' ? 0.4 + Math.random() * 0.2 : 0;
      const creature = new Creature(gs, cx, cy, { bodyRadius: 24, arms: [], deformation, jitter: 0 });
      creatureManager.add(creature);
      if (creatureManager.mode === 'editor') creatureManager.select(creature);
      return creature;
    }

    // Juice/sound editing uses the shared right-edge editor (mounted by the
    // shell in onActivate). Only the creature editor lives in primitives' own
    // panel now.
    new Editor(creatureManager, document.getElementById('editor-panel'), createCreature);
    creatureManager.onSpawnRequest = (x, y) => createCreature(x, y);

    creatureManager.mode = currentMode;
    foodManager.enable();

    function setMode(mode) {
      if (mode === currentMode) return;
      currentMode = mode;
      creatureManager.mode = mode;
      document.body.classList.toggle('mode-play', mode === 'play');
      document.body.classList.toggle('mode-editor', mode === 'editor');
      document.body.classList.toggle('mode-garden', mode === 'garden');
      document.querySelectorAll('#mode-tabs .tab').forEach((btn) =>
        btn.classList.toggle('active', btn.dataset.mode === mode));
      if (mode !== 'editor') creatureManager.select(null);
      if (mode === 'editor' || mode === 'garden') foodManager.disable();
      else foodManager.enable();
      inkManager.setEnabled(mode === 'garden');
      if (mode === 'garden') gardenScatter.enable(); else gardenScatter.disable();
      creatureManager.clickSpawnEnabled = (mode !== 'garden');
    }

    document.body.classList.add('mode-play');
    document.querySelectorAll('#mode-tabs .tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === currentMode);
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
  },
};
