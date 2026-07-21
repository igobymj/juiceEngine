/*
 * asteroids — the juicyRocks asteroids game, retrofitted as a juiceEngine app.
 *
 * The whole game is wired in build(gs): its juice seed (from the ported
 * AsteroidsJuiceSettings), managers, sounds, loop systems, input, and initial
 * ship/level. It runs on the shared canvas the AppShell owns, so it does NOT
 * boot p5 and does NOT register the input/juice systems (the shell already
 * does). Its old 941-line JuiceGuiManager is gone — juice/sound editing uses
 * the shared native editors, and its non-event settings (music, colors,
 * eyeballs, cheats) are declared as `extras` below.
 */

import System from "../engine/System.js";
import HelperFunctions from "../engine/HelperFunctions.js";
import AsteroidsJuiceSettings from "../game/asteroids/AsteroidsJuiceSettings.js";
import ShipManager from "../game/asteroids/Managers/ShipManager.js";
import AsteroidManager from "../game/asteroids/Managers/AsteroidManager.js";
import BulletManager from "../game/asteroids/Managers/BulletManager.js";
import ScoreManager from "../game/asteroids/Managers/ScoreManager.js";
import BulletSound from "../game/asteroids/sounds/BulletSound.js";
import ExplosionSound from "../game/asteroids/sounds/ExplosionSound.js";
import ThrusterSound from "../game/asteroids/sounds/ThrusterSound.js";
import MusicManager from "../game/asteroids/sounds/MusicManager.js";
import SampleSoundObject from "../engine/sounds/SampleSoundObject.js";

const PANEL_WIDTH = 300;   // shared right-edge editor panel width (see index.css --panel-w)

let savedJuice = null;   // persisted asteroids juice, loaded before build
export function setSavedJuice(data) { savedJuice = data; }

/* ---------- systems lifted from AsteroidsGameLoop ---------- */

// Maps the engine InputManager's `movement` vector onto the forward/left/right
// booleans the ported Ship reads (keeps Ship byte-identical to its origin).
class ShipInput extends System {
  update() {
    const io = this.gameSession.inputManager.inputObject;
    const m = io.movement || { x: 0, y: 0 };
    io.forward = m.y < 0;   // W / ArrowUp thrusts
    io.left = m.x < 0;      // A / ArrowLeft
    io.right = m.x > 0;     // D / ArrowRight
  }
}

class ThrustTrail extends System {
  update() {
    const gs = this.gameSession;
    const ship = gs.shipManager.ship;
    if (ship && ship.thrust) {
      const backAngle = ship.rotation + Math.PI;
      const rearOffset = p5.Vector.fromAngle(backAngle).mult(15);
      gs.juiceEventManager.addNew('shipThrust', {
        position: p5.Vector.add(ship.position, rearOffset),
        velocity: gs.p5.createVector(0, 0),
      });
    }
  }
}

class SillyColors extends System {
  render() {
    const gs = this.gameSession;
    const juiceFxOn = gs.juiceSettings.container.cheats.juiceFx;
    const colors = gs.juiceSettings.container.sillyColors;
    const pp = gs.p5;
    if (juiceFxOn && colors && colors.active) {
      const ship = gs.shipManager.ship;
      const shipRGB = HelperFunctions.HueToRGB(colors.shipHue);
      if (ship && shipRGB) { ship.fill = true; ship.fillColor = pp.color(shipRGB[0], shipRGB[1], shipRGB[2]); }
      else if (ship) { ship.fill = false; }

      const asteroids = gs.asteroidManager.asteroids;
      const astRGB = HelperFunctions.HueToRGB(colors.asteroidHue);
      for (let i = 0; i < asteroids.length; i++) {
        if (astRGB) { asteroids[i].fill = true; asteroids[i].fillColor = pp.color(astRGB[0], astRGB[1], astRGB[2]); }
        else { asteroids[i].fill = false; }
      }

      const bgRGB = HelperFunctions.HueToRGB(colors.backgroundHue);
      gs.backgroundColor = bgRGB ? pp.color(bgRGB[0], bgRGB[1], bgRGB[2]) : 0;
    } else {
      if (gs.shipManager.ship) gs.shipManager.ship.fill = false;
      const asteroids = gs.asteroidManager.asteroids;
      for (let i = 0; i < asteroids.length; i++) asteroids[i].fill = false;
      gs.backgroundColor = 0;
    }
  }
}

/* ---------- sounds (was AsteroidsSession._setupSounds) ---------- */

function setupSounds(gs) {
  const sm = gs.soundManager;

  const bulletSound = new BulletSound(gs);
  sm.registerSound('bullet', bulletSound);
  const explosionSound = new ExplosionSound(gs);
  sm.registerSound('explosion', explosionSound);
  const thrusterSound = new ThrusterSound(gs);
  sm.registerSound('thruster', thrusterSound);
  const cheerSound = new SampleSoundObject(gs, 'media/audio/kids-cheering.mp3');
  sm.registerSound('cheer', cheerSound);
  const musicManager = new MusicManager(gs);
  sm.registerSound('music', musicManager, 'music');

  // Convenience methods the ported game code calls on the sound manager.
  sm.playBullet = () => bulletSound.play();
  sm.playExplosion = () => explosionSound.play();
  sm.playThruster = () => thrusterSound.play();
  sm.stopThruster = () => thrusterSound.stop();
  sm.playCheer = () => cheerSound.play();
  sm.startHeartbeat = () => musicManager.startHeartbeat();
  sm.stopHeartbeat = () => musicManager.stopHeartbeat();
  sm.setHeartbeatTempo = (bpm) => musicManager.setHeartbeatTempo(bpm);
  sm.updateHeartbeatTempo = () => musicManager.setHeartbeatTempo(60);
  sm.playMusic = () => musicManager.playTrack();
  sm.stopMusic = () => musicManager.stopTrack();
  sm.selectTrack = (url) => {
    musicManager.stopHeartbeat();
    musicManager.loadTrack(url);
    if (url) musicManager.playTrack();
  };
}

// Switch music source from the extras menu: 'heartbeat' drives the procedural
// heartbeat, any other value loads/plays that audio file.
function applyMusicTrack(gs, value) {
  const sm = gs.soundManager;
  if (value === 'heartbeat') {
    sm.stopMusic();
    sm.startHeartbeat();
  } else {
    sm.stopHeartbeat();
    sm.selectTrack(value);
  }
}

// Side effects for extras edits — bound to a session in onActivate (the extras
// editor itself is session-agnostic). Only music needs live action; the colors/
// eyeballs/cheats/sillySounds blocks are read straight from the container each
// frame by the game systems.
export function extraApply(gs, block, param, value) {
  if (block === 'music' && param === 'track') applyMusicTrack(gs, value);
  else if (block === 'music' && param === 'volume') gs.soundManager.setMusicVolume(value);
}

/* ---------- app descriptor ---------- */

export default {
  id: 'asteroids',
  title: 'asteroids',
  background: '#000000',

  // Non-event settings, surfaced in the shared "extras" fold. cheats first so
  // the invincibility toggle is the first control under EXTRAS.
  extras: {
    schema: {
      cheats: {
        label: 'cheats',
        params: [
          { key: 'invincibility', type: 'bool', path: 'ship.invincibility' },
          { key: 'juiceFx', type: 'bool' },
        ],
      },
      music: {
        label: 'music',
        params: [
          {
            key: 'track', type: 'select', options: [
              { value: 'heartbeat', label: 'Heartbeat' },
              { value: 'media/music/techno-trance.mp3', label: 'Techno-Trance' },
              { value: 'media/music/spy-theme.mp3', label: 'Spy Theme' },
              { value: 'media/music/space-out.mp3', label: 'Space Out' },
            ],
          },
          { key: 'volume', type: 'range', min: -40, max: 0, step: 1, suffix: 'dB' },
        ],
      },
      sillyColors: {
        label: 'silly colors',
        params: [
          { key: 'active', type: 'bool' },
          { key: 'shipHue', type: 'range', min: 0, max: 360, step: 1, preview: 'hue' },
          { key: 'asteroidHue', type: 'range', min: 0, max: 360, step: 1, preview: 'hue' },
          { key: 'backgroundHue', type: 'range', min: 0, max: 360, step: 1, preview: 'hue' },
        ],
      },
      eyeBallsOnAsteroids: {
        label: 'eyeballs',
        params: [{ key: 'active', type: 'bool', path: 'eyeBalls.active', label: 'eyeballs on asteroids' }],
      },
      sillySounds: {
        label: 'silly sounds',
        params: [{ key: 'pewpewpew', type: 'bool' }],
      },
    },
    // onApply is bound to the session in onActivate (see index.js) via extraApply.
  },

  build(gs) {
    // --- juice seed (from the ported settings), overlaid by saved settings ---
    const ajs = new AsteroidsJuiceSettings();
    gs.juiceSettings.extend(ajs.container);
    gs.juiceSettings.extendParticleSystems(ajs.particleSystems);
    // The engine's master juice switch defaults off; turn it on (burst/primitives
    // do the same). Without this, addNew() bails and NO juice/sound fires.
    gs.juiceSettings.extend({ cheats: { juiceFx: true } });
    if (savedJuice) {
      if (savedJuice.container) gs.juiceSettings.extend(savedJuice.container);
      if (savedJuice.particleSystems) gs.juiceSettings.extendParticleSystems(savedJuice.particleSystems);
    }

    // --- managers ---
    gs.registerManager('shipManager', new ShipManager(gs));
    gs.registerManager('asteroidManager', new AsteroidManager(gs));
    gs.registerManager('bulletManager', new BulletManager(gs));
    gs.registerManager('scoreManager', new ScoreManager(gs));
    // The shared editor panel overlays the right edge of the full-width canvas;
    // inset the score so it sits in the visible play field, not behind it.
    gs.scoreManager.rightInset = PANEL_WIDTH;

    // --- sounds ---
    setupSounds(gs);

    // --- systems (input=0 and juice=200 are registered by the shell) ---
    const shipInput = new ShipInput(gs);
    const thrustTrail = new ThrustTrail(gs);
    const sillyColors = new SillyColors(gs);

    gs.gameLoop.addUpdateSystem('shipInput', shipInput, 5);
    gs.gameLoop.addUpdateSystem('bullets', gs.bulletManager, 20);
    gs.gameLoop.addUpdateSystem('asteroids', gs.asteroidManager, 30);
    gs.gameLoop.addUpdateSystem('ship', { update: () => gs.shipManager.ship.update() }, 40);
    gs.gameLoop.addUpdateSystem('thrustTrail', thrustTrail, 50);
    gs.gameLoop.addUpdateSystem('score', gs.scoreManager, 70);

    gs.gameLoop.addRenderSystem('sillyColors', sillyColors, 5);
    gs.gameLoop.addRenderSystem('bullets', gs.bulletManager, 10);
    gs.gameLoop.addRenderSystem('ship', { render: () => gs.shipManager.ship.render() }, 20);
    gs.gameLoop.addRenderSystem('asteroids', gs.asteroidManager, 30);
    gs.gameLoop.addRenderSystem('score', gs.scoreManager, 50);

    // --- input: fire on Enter / Shift / Space when the ship is alive ---
    gs.inputManager.addKeyHandler((key) => {
      if ((key === 'Enter' || key === 'Shift' || key === ' ')
        && gs.shipManager.ship && gs.shipManager.ship.shipAlive) {
        gs.shipManager.ship.fireBullet();
      }
    });

    // --- start the game ---
    gs.shipManager.createShip();
    gs.asteroidManager.levelStart();
  },
};
