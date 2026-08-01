/*
 * RTD — a rhythm game, built as a juiceEngine app.
 *
 * Pulse objects (a "kick-circle" and an imported spaceship) sit on the canvas
 * and pulse on the beat, playing a sound at the moment of each pulse. RtdManager
 * owns the objects; RtdEditor (mounted in onActivate) edits the selected object
 * the way the primitives editor edits a creature. New voices come from toneSynths.
 *
 * RTD has mode tabs (#rtd-tabs) over ONE shared authored scene: 'objects' edits/
 * selects via the editor panel, 'editor' tunes the juice/extras panel over the live
 * scene, and 'game' plays it — a scrolling procedural starfield with the ship flying
 * up it. Every mode renders and updates the same objects; the mode only changes
 * behaviour (interactive editing vs play), not the object set.
 *
 * Persistence mirrors juice settings: the editor's Save button POSTs the scene to
 * /api/config/rtd (written to public/scripts/data/rtd.json), loaded before build().
 * The file has an { objects: {…} } section keyed by object instance (plus retained
 * prototype templates). Prototypes persist in full; instances persist only a reference
 * (their link + name + placement) and reconstitute the inherited props from their
 * prototype on load, so a saved instance can never drift from it (RtdManager.serialize).
 */

import RtdManager from "../game/rtd/RtdManager.js";
import PulseObject from "../game/rtd/PulseObject.js";
import Starfield from "../game/rtd/Starfield.js";
import ProjectileManager from "../game/rtd/ProjectileManager.js";
import RtdBulletSound from "../game/rtd/RtdBulletSound.js";
import AsteroidManager from "../game/rtd/AsteroidManager.js";
import RtdExplosionSound from "../game/rtd/RtdExplosionSound.js";
import ModeManager from "../engine/ModeManager.js";
import PerfOverlay from "../engine/PerfOverlay.js";
import MusicPlayer from "../engine/sounds/MusicPlayer.js";
import { registerToneSynths } from "../engine/sounds/toneSynths.js";
import { loadSvg, normalizeShapes, svgToVectorObjects } from "../engine/loaders/SvgImport.js";

const SHIP_SVG = 'media/svg/spaceship.svg';
const FLAME_SVG = 'media/svg/shipFlame.svg';   // authored in the ship's viewBox, below the nozzle
const FLAME_OFFSET_Y = 25;   // extra downward nudge (ship-local units) below the nozzle
const MODE_BAR_H = 40;   // height of the #rtd-tabs strip overlaying the canvas top

// RTD's juice events, editable in editor mode. Firing 'bulletFire'/'asteroidHit'
// (see ProjectileManager / AsteroidManager) runs the event's active effects.
// juiceFx is the master switch — on so events fire out of the box.
const RTD_JUICE_DEFAULTS = {
  cheats: { juiceFx: true },
  sillyColors: { active: false, particleHue: 0 },   // read by the particle effect
  // Background music, surfaced in the EXTRAS fold (assigned in editor mode). The
  // track list is enumerated from media/music at load; see index.js.
  music: { track: 'none', volume: -12, play: false },
  bulletFire: {
    sound: { active: true, synth: 'bullet', clip: 'none', volume: -12, rate: 1 },
    shake: { active: false, xAxis: true, yAxis: true, amplitude: 0.25, frequency: 12, duration: 0.12, form: 'simple', fade: false, inheritVelocity: false },
  },
  // A debris particle burst + a screen shake + the explosion sound on the hit.
  asteroidHit: {
    particles: { active: true, particleSystem: 'asteroidHit' },
    shake: { active: true, xAxis: true, yAxis: true, amplitude: 0.6, frequency: 10, duration: 0.4, form: 'noise', fade: 'exponential', inheritVelocity: false },
    sound: { active: true, synth: 'explosion', clip: 'none', volume: -6, rate: 1 },
  },
};

// Particle systems referenced by the juice events (extendParticleSystems).
const RTD_PARTICLE_SYSTEMS = {
  asteroidHit: {
    vectorParticle: {
      shape: 'line',
      count: 18,
      size: 12,
      pattern: 'radial',
      rotation: 'random',
      rotationSpeed: 5,
      particleLife: 1.5,
      initialVelocityRandom: true,
      initialVelocity: 45,
      fade: true,
      followObject: false,
      inheritVelocity: false,
    },
  },
};

let savedState = null;   // persisted scene ({ objects: {…}, retainedPrototypes: [] }), loaded before build
export function setSavedState(data) { savedState = data; }

let savedJuice = null;   // persisted juice/sounds/extras (editor mode), loaded before build
export function setSavedJuice(data) { savedJuice = data; }

// Drop canvas clicks that land on RTD's own chrome: the mode-tab strip along the
// top, and the right-edge panel whenever it's shown (objects + editor modes; game
// hides it). Mirrors primitives'.
export function pointerGuard(x, y, gs) {
  if (y < MODE_BAR_H) return true;
  const rtd = gs.rtdManager;
  const mode = rtd && rtd.modes && rtd.modes.current;
  if (mode === 'objects' || mode === 'editor') return x > gs.canvasWidth - 300;   // panel width
  return false;
}

// Side effects for EXTRAS edits — bound to the active session in onActivate (the
// extras editor is session-agnostic). Only music needs live action; other blocks
// (cheats, sillyColors) are read straight from the container by the game systems.
// track: load the file (and play if 'play' is on). play: start/stop. volume: mix.
export function extraApply(gs, block, param, value) {
  if (block !== 'music') return;
  const sm = gs.soundManager;
  const music = gs.juiceSettings.container.music || {};
  if (param === 'track') {
    sm.selectMusic(value);
    if (music.play) sm.playMusic();
  } else if (param === 'play') {
    if (value) sm.playMusic();
    else sm.stopMusic();
  } else if (param === 'volume') {
    sm.setMusicVolume(value);
  }
}

export default {
  id: 'rtd',
  // Non-event settings surfaced in the shared EXTRAS fold (editor mode). The
  // music track options are dynamic (enumerated from media/music) and injected
  // in index.js via optionSources; onApply is bound there too (see extraApply).
  extras: {
    schema: {
      music: {
        label: 'music',
        params: [
          { key: 'track', type: 'select', optionsKey: 'musicTracks' },
          { key: 'play', type: 'bool', label: 'play' },
          { key: 'volume', type: 'range', min: -40, max: 0, step: 1, suffix: 'dB' },
        ],
      },
    },
  },
  title: 'RTD',
  background: '#141018',

  build(gs) {
    // Define RTD's juice events (bulletFire, asteroidHit) and their particle
    // systems, then overlay any persisted tweaks so saved values win.
    gs.juiceSettings.extend(RTD_JUICE_DEFAULTS);
    gs.juiceSettings.extendParticleSystems(RTD_PARTICLE_SYSTEMS);
    if (savedJuice && savedJuice.container) gs.juiceSettings.extend(savedJuice.container);
    if (savedJuice && savedJuice.particleSystems) gs.juiceSettings.extendParticleSystems(savedJuice.particleSystems);

    // The full synth drum kit from the toneSynths library (kick, snare, clap,
    // shaker, hats, cowbell, crash, toms, rimshot) — each selectable as an object's
    // sound and played on the beat.
    registerToneSynths(gs);

    const rtd = new RtdManager(gs);
    gs.registerManager('rtdManager', rtd);
    gs.gameLoop.addUpdateSystem('rtd', rtd, 50);
    gs.gameLoop.addRenderSystem('rtd', rtd, 50);

    // Click selects an object (empty space deselects); drag relocates it. Active
    // in objects mode and editor mode (see RtdManager.interactive).
    gs.inputManager.addMouseHandler({
      mousePressed: (x, y) => rtd.mousePressed(x, y),
      mouseDragged: (x, y) => rtd.mouseDragged(x, y),
      mouseReleased: () => rtd.mouseReleased(),
    });

    // Delete/Backspace removes the selected object while editing (objects/editor).
    gs.inputManager.addKeyHandler((key) => {
      if ((key === 'Delete' || key === 'Backspace') && rtd.interactive) rtd.deleteSelected();
    });

    // How the manager turns a record into a live object (ships need async import).
    rtd.instantiate = (rec) => createFromRecord(gs, rtd, rec);

    // Scrolling star background for game mode; rendered behind the objects (lower
    // priority than RtdManager's 50) and enabled only in game mode by the modes.
    const starfield = new Starfield(gs);
    gs.gameLoop.addUpdateSystem('rtd-stars', starfield, 20);
    gs.gameLoop.addRenderSystem('rtd-stars', starfield, 20);

    // Sounds are registered by name so the juice 'sound' effector can play them
    // (see RTD_JUICE_DEFAULTS: bulletFire → 'bullet', asteroidHit → 'explosion').
    gs.soundManager.registerSound('bullet', new RtdBulletSound(gs));
    gs.soundManager.registerSound('explosion', new RtdExplosionSound(gs));

    // Background music player on the music channel (shares the master mute and
    // setMusicVolume). Track/volume/play are driven from the EXTRAS fold; see
    // rtdExtraApply below. Convenience methods keep the extras handler tidy.
    const music = new MusicPlayer(gs);
    gs.soundManager.registerSound('music', music, 'music');
    gs.soundManager.selectMusic = (url) => music.loadTrack(url);
    gs.soundManager.playMusic = (opts) => music.playTrack(opts);
    gs.soundManager.stopMusic = () => music.stopTrack();

    // Asteroids: drift, despawn off-screen, respawn when the field is cleared.
    // Bullets ask asteroidManager.collide(); a hit fires the asteroidHit event.
    const asteroids = new AsteroidManager(gs, { event: 'asteroidHit' });
    gs.registerManager('asteroidManager', asteroids);
    gs.gameLoop.addUpdateSystem('rtd-asteroids', asteroids, 30);
    gs.gameLoop.addRenderSystem('rtd-asteroids', asteroids, 30);

    // Projectiles (RTD's own Bullet). Each shot fires the bulletFire event.
    const projectiles = new ProjectileManager(gs, { event: 'bulletFire' });
    gs.gameLoop.addUpdateSystem('rtd-bullets', projectiles, 40);
    gs.gameLoop.addRenderSystem('rtd-bullets', projectiles, 40);

    // Perf overlay (toggle with the ` backtick key): FPS, frame time, live counts.
    // Not registered with any mode, so it's always available and near-free when hidden.
    const perf = new PerfOverlay(gs, () => ({
      objects: rtd.objects.length,
      asteroids: asteroids.asteroids.length,
      bullets: projectiles.bullets.length,
    }));
    gs.gameLoop.addRenderSystem('rtd-perf', perf, 999);
    gs.inputManager.addKeyHandler((key, code) => { if (code === 'Backquote') perf.toggle(); });

    // Three modes (like primitives): 'objects' edits/selects via the object editor;
    // 'game' is the play scene (starfield, ship, asteroids, bullets); 'editor' is
    // the same scene with the shared juice/sounds/extras panel mounted over it. The
    // gameplay systems are mode-gated so they run only in game/editor.
    const modes = new ModeManager(gs);
    rtd.modes = modes;
    modes.define('objects', { enter() { rtd.setMode('objects'); } });
    // The play scene. 'editor' runs exactly the same scene but the app also mounts
    // the shared juice/sounds/extras panel over it (see index.js onActivate).
    // Populate the asteroid field on entering a play mode: the first wave, or a refill
    // if a previous session left it empty (start() is one-shot; levelStart() refills).
    const startAsteroids = () => { asteroids.start(); if (asteroids.asteroids.length === 0) asteroids.levelStart(); };
    const playScene = () => { rtd.setMode('game'); ensureGameShip(gs, rtd); startAsteroids(); };
    // Game mode arms the music drop: the round starts silent (just the beat), and the
    // player drops the track in by hitting FIRE on the beat (see tryDropMusic).
    const enterGame = () => { playScene(); armMusicDrop(gs, rtd); };
    // Editor tunes the single authored scene (same objects as every mode) with the
    // gameplay running: interactive (select/drag), systems on, juice/extras panel
    // mounted (see index.js). Firing works here too; the extras 'play' toggle controls
    // music. Only the on-beat music drop is game-only.
    const enterEditor = () => { rtd.setMode('editor'); startAsteroids(); };
    modes.define('game', { systems: [starfield, asteroids, projectiles], enter: enterGame });
    modes.define('editor', { systems: [starfield, asteroids, projectiles], enter: enterEditor });
    modes.bindTabs('#rtd-tabs');
    modes.set('objects');

    // FIRE — up arrow, duplicated on the right shift key (matched by event.code so
    // left shift is unaffected). Gameplay runs in game AND editor, so firing works in
    // both; the on-beat music drop is a game-only mechanic (armed on game entry).
    gs.inputManager.addKeyHandler((key, code) => {
      if (code !== 'ArrowUp' && code !== 'ShiftRight') return;
      if (rtd.mode !== 'game' && rtd.mode !== 'editor') return;
      if (rtd.mode === 'game') tryDropMusic(gs, rtd);
      if (rtd.ship) fireFromShipNose(gs, projectiles, rtd.ship);
    });

    // Build the scene (persisted if present, else default). It places objects
    // using canvas dimensions — and when RTD is the default app, build() runs
    // before p5 setup, so dims can be 0 here. Defer to the first frame with real
    // dimensions in that case.
    const initScene = () => {
      const saved = savedState || {};
      const savedObjects = saved.objects || {};
      if (Object.keys(savedObjects).length) {
        for (const [id, rec] of Object.entries(savedObjects)) createFromRecord(gs, rtd, { ...rec, id, select: false });
      } else {
        buildDefaultScene(gs, rtd);
      }
      // Legacy scenes also had a transient 'game' section (runtime ship instances);
      // it's intentionally dropped — the authored 'objects' are the single scene now.
      rtd.restoreRetainedPrototypes(saved.retainedPrototypes);   // templates of deleted prototypes
      ensureMetronomePrototype(gs, rtd);   // always offered in the editor's prototype dropdown
      ensureDrumKickPrototype(gs, rtd);
    };
    if (gs.canvasWidth > 0) {
      initScene();
    } else {
      const boot = { update() { if (gs.canvasWidth > 0) { initScene(); boot.enabled = false; } } };
      gs.gameLoop.addUpdateSystem('rtd-scene-init', boot, 5);
    }
  },
};

// How close to a beat (ms, either side) a FIRE press must land to drop the music in.
const RTD_BEAT_WINDOW_MS = 250;   // ~0.25s

// Arm the music drop for a fresh round: load the selected track but hold it silent,
// and reset the one-shot gate. The scene then plays only the beat until the player
// hits FIRE on it (see tryDropMusic).
function armMusicDrop(gs, rtd) {
  rtd.__musicDropped = false;
  const track = (gs.juiceSettings.container.music || {}).track;
  gs.soundManager.selectMusic(track || 'none');   // loadTrack holds it stopped until played
}

// On a FIRE press, start the music if it lands within RTD_BEAT_WINDOW_MS of a master
// beat — the track kicks in at that moment, so the player's timing is the alignment.
// One-shot per round; an off-beat press does nothing, so they can try the next beat.
function tryDropMusic(gs, rtd) {
  if (rtd.__musicDropped) return;
  const grid = rtd.beatGrid;
  const interval = grid && grid.masterInterval;
  if (!interval) return;
  // Gate on beat proximity at the moment of the press.
  const t = gs.timeManager.realTimeSinceStartup;
  const phase = (((t - grid.epoch) % interval) + interval) % interval;
  if (Math.min(phase, interval - phase) > RTD_BEAT_WINDOW_MS) return;    // off the beat — no drop
  rtd.__musicDropped = true;
  // Start snapped to the beat. Pass a function so the snap is (re)computed against the
  // grid at the instant playback actually begins — correct even if the track was still
  // loading when FIRE was pressed (armMusicDrop usually preloads it, but not always).
  gs.soundManager.playMusic(() => musicSnapOpts(gs, rtd));
}

// Tone start options that land the track on the nearest grid beat: an upcoming beat
// schedules the start there (from the top); a just-passed beat starts now offset into
// the track by that much, so the loop is phase-locked to the grid either way.
function musicSnapOpts(gs, rtd) {
  const grid = rtd.beatGrid;
  const interval = (grid && grid.masterInterval) || 0;
  if (!interval) return {};   // no grid — just start from the top
  const t = gs.timeManager.realTimeSinceStartup;
  const phase = (((t - grid.epoch) % interval) + interval) % interval;
  const toPrev = phase, toNext = interval - phase;
  const now = window.Tone ? Tone.now() : 0;
  return (toNext <= toPrev) ? { at: now + toNext / 1000 } : { offset: toPrev / 1000 };
}

// Fire from the ship's nose along the direction it faces. The ship art points up
// (nose at the top of its bounds, ~radius px above centre), so with rotation 0 a
// shot goes straight up; ship.rotation rotates both the muzzle and the heading.
function fireFromShipNose(gs, projectiles, ship) {
  const r = ship.rotation || 0;
  const dist = ship.radius;   // nose sits ~radius px from centre (half the ship's height)
  const nose = gs.p5.createVector(ship.x + Math.sin(r) * dist, ship.y - Math.cos(r) * dist);
  projectiles.fire(nose, r - Math.PI / 2);   // fromAngle heading; r=0 → up
}

// Make sure game mode has a ship on the starfield. Spawns the ship prototype
// (into the game collection) once per session if none is already present — the
// runtime instancing the game mode is built around. WASD then steers it.
function ensureGameShip(gs, rtd) {
  if (rtd.__gameShipReady) return;
  if (rtd.objects.some((o) => o.kind === 'ship')) { rtd.__gameShipReady = true; return; }  // loaded/saved one already
  const proto = rtd.prototypes.find((o) => o.kind === 'ship');
  if (!proto) return;   // ship prototype not imported yet — retry on the next game entry
  rtd.__gameShipReady = true;
  rtd.createFromPrototype(proto.name, { x: gs.canvasWidth / 2, y: gs.canvasHeight * 0.62 });
}

// Guarantee the metronome prototype exists — a juice-editor beat reference you
// tune like any other object (radius, tempo, pulse, sound). Runs after the scene
// loads, so it's present for scenes saved before the metronome existed and always
// appears in the editor's prototype dropdown. Lives in the 'objects' collection
// alongside the other prototypes; its instances only render in editor mode.
function ensureMetronomePrototype(gs, rtd) {
  if (rtd.prototypes.some((o) => o.kind === 'metronome')) return;
  rtd.createObject({
    name: 'metronome',
    kind: 'metronome',
    isPrototype: true,
    collection: 'objects',
    select: false,
    x: gs.canvasWidth / 2 + 120,
    y: gs.canvasHeight / 2,
    bpm: 100,
    sound: 'kick',
  });
}

// Guarantee the drumKick prototype exists — a Tone.js kick-drum voice slaved to the
// metronome's grid (its subdivision/phase decide how it locks). Seeded like the
// metronome so it's always offered in the editor's prototype dropdown, including for
// scenes saved before drumKick existed.
function ensureDrumKickPrototype(gs, rtd) {
  if (rtd.prototypes.some((o) => o.kind === 'drumKick')) return;
  rtd.createObject({
    name: 'drum kick',
    kind: 'drumKick',
    isPrototype: true,
    collection: 'objects',
    select: false,
    x: gs.canvasWidth / 2 - 120,
    y: gs.canvasHeight / 2,
    bpm: 100,
    sound: 'kick',
  });
}

// Rebuild one persisted instance. Ship shapes can't be serialized, so they're
// re-imported from the record's svg source; everything else is applied as-is.
function createFromRecord(gs, rtd, rec) {
  if (rec.kind === 'ship') buildShip(gs, rtd, rec);
  else rtd.createObject(rec);
}

// The default scene when nothing is saved: a kick-circle plus the ship, both
// prototypes in the 'objects' collection (the ship import is async, so pin the
// collection explicitly in case the mode changes before it resolves).
function buildDefaultScene(gs, rtd) {
  rtd.createObject({
    name: 'kick-circle',
    isPrototype: true,
    collection: 'objects',
    select: false,
    x: gs.canvasWidth / 2,
    y: gs.canvasHeight / 2,
    bpm: 100,
    sound: 'kick',
  });
  buildShip(gs, rtd, {
    name: 'spaceship',
    isPrototype: true,
    collection: 'objects',
    select: false,
    x: gs.canvasWidth / 2 - 50,
    y: gs.canvasHeight / 2,
    bpm: 100,
    sound: 'kick',
  });
}

// Import a ship's SVG via the SVG import pathway (fetch + sample to point arrays,
// recentre/scale, build vector objects), then create its 'ship' PulseObject. The
// object drives the shapes' position/scale each frame, so it pulses on the beat
// and gets the same editor controls as the kick-circle. Async — appears once loaded.
//
// The exhaust flame (shipFlame.svg) is imported into the *ship's* local frame —
// same centre and scale — so it keeps its authored spot below the nozzle, then
// attached as a child that inherits the ship's transform (see PulseObject).
function buildShip(gs, rtd, rec) {
  const svg = rec.svg || SHIP_SVG;
  const targetSize = 2 * PulseObject.SHIP_REF_RADIUS;
  Promise.all([loadSvg(svg, { sampleDistance: 2 }), loadSvg(FLAME_SVG, { sampleDistance: 2 })])
    .then(([ship, flame]) => {
      const b = ship.bounds;
      const scale = targetSize / (Math.max(b.width, b.height) || 1);   // the ship's own fit scale

      const shipObjs = svgToVectorObjects(gs, normalizeShapes(ship.shapes, { targetSize }), { strokeWeight: 2 });
      // Place the flame relative to the ship's centre (not its own) so it lands
      // just below the nozzle, exactly as authored in the shared viewBox, then
      // nudge it farther down in the ship's local frame (scales/rotates with it).
      const flameNorm = normalizeShapes(flame.shapes, { about: { x: b.cx, y: b.cy }, scale })
        .map((shape) => shape.map((pt) => ({ x: pt.x, y: pt.y + FLAME_OFFSET_Y })));
      const flameObjs = svgToVectorObjects(gs, flameNorm, { strokeWeight: 2 });
      rtd.createObject({ ...rec, kind: 'ship', svg, shapes: shipObjs, children: [{ shapes: flameObjs, blink: true }] });
    })
    .catch((e) => console.warn('spaceship SVG import failed:', e));
}
