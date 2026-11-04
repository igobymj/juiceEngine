/*
 * Asteroid — a drifting, tumbling rock spawned from an authored obstacle definition.
 *
 * The AsteroidManager builds these from an 'obstacle' PulseObject prototype (see
 * RtdManager.obstacleDef): a base rock polygon scaled by the definition's `size`, drifting
 * on a random heading at `driftSpeed`, tumbling at `spinSpeed`, tinted `color`. It carries
 * its definition so, when destroyed, the manager knows what it spawns (`spawns` prototype,
 * at `spawnProbability`). Extends VectorGameObject so it collides with projectiles.
 */

import VectorGameObject from "../../engine/VectorGameObject.js";

// Uniform random in [min,max], tolerating a swapped (min>max) range.
const rand = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + Math.random() * (hi - lo); };

const MOVEMENT_MULTIPLIER = 0.1;   // scales the drift speed (with deltaTime)
const REF = 72;                    // the base polygon's half-extent; `size` scales against it

// Base rock outline (authored around a ±72 box), scaled per definition.
const BASE_SHAPE = [
  { x: 68, y: -51 }, { x: -3, y: -80 }, { x: -58, y: -51 }, { x: -71, y: 1 },
  { x: -38, y: 62 }, { x: 4, y: 54 }, { x: 17, y: 34 }, { x: 33, y: 49 },
  { x: 68, y: 26 }, { x: 72, y: -8 },
];

export default class Asteroid extends VectorGameObject {
  constructor(gameSession, def = {}, x, y) {
    const size = def.size ?? 60;
    const sc = size / REF;
    const verts = BASE_SHAPE.map((v) => ({ x: v.x * sc, y: v.y * sc }));
    super(gameSession, x, y, verts, true, 2, false, 0, 1, 255);

    this.def = def;                                   // read by the manager on destruction
    this.strokeColor = this.p5.color(def.color || '#8a8580');

    // Drift and spin are randomized per rock, each drawn from an authored [min,max] range
    // (legacy single-value driftSpeed/spinSpeed migrate into the max). Drift = a random speed
    // in the range along a random heading; spin = a random magnitude in the range, random dir.
    const speed = rand(def.driftMin ?? 0, def.driftMax ?? def.driftSpeed ?? 1.5);
    const heading = Math.random() * Math.PI * 2;
    this.__movementVector = this.p5.createVector(Math.cos(heading) * speed, Math.sin(heading) * speed);
    const spinMag = rand(def.spinMin ?? 0, def.spinMax ?? def.spinSpeed ?? 0.02);
    this.__spin = spinMag * (Math.random() < 0.5 ? -1 : 1);   // rad/ms, random direction
    this.__deltaDistance = this.p5.createVector(0, 0);

    // Beat pulse (same feel as a PulseObject): jump to pulseScale on each master beat, ease
    // back toward rest by relax each frame. Applied via the object's scale.
    this.__pulseScale = def.pulseScale ?? 1;
    this.__relax = def.relax ?? 0.16;
    this.__division = def.division ?? 1;   // pulses per master beat (subdivision, like the ship)
    this.__pulse = 1;
    this.__lastBeat = this._beatIndex();   // don't pulse on the very first frame
  }

  // What this rock spawns when destroyed (a prototype's bare name, or 'none') and the chance.
  get spawns() { return this.def.spawns ?? 'none'; }
  get spawnProbability() { return this.def.spawnProbability ?? 0; }

  // Current pulse-beat index off the shared grid, subdivided by `division` (1 = on the master
  // beat, 2 = eighths, 0.5 = every two beats) — the same subdivision the ship uses.
  _beatIndex() {
    const g = this.gameSession.rtdManager && this.gameSession.rtdManager.beatGrid;
    if (!g || !g.masterInterval) return -Infinity;
    const interval = g.masterInterval / Math.max(0.01, this.__division || 1);
    const t = this.gameSession.timeManager.realTimeSinceStartup;
    return Math.floor((t - g.epoch) / interval);
  }

  offScreen() {
    const margin = this.diagonal / 2;
    const w = this.gameSession.canvasWidth;
    const h = this.gameSession.canvasHeight;
    const p = this.__position;
    return p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin;
  }

  // Returns false once the asteroid has drifted fully off-screen (despawn).
  update() {
    const dt = this.gameSession.timeManager.deltaTime;
    this.__deltaDistance
      .set(this.__movementVector.x, this.__movementVector.y)
      .mult(MOVEMENT_MULTIPLIER * dt);
    this.position.add(this.__deltaDistance);
    this.rotation += this.__spin * dt;

    // Beat pulse: spike the scale on a new master beat, then relax back toward 1.
    const b = this._beatIndex();
    if (b > this.__lastBeat) { this.__lastBeat = b; this.__pulse = this.__pulseScale; }
    this.__pulse += (1 - this.__pulse) * this.__relax;
    this.scale = this.__pulse;

    return !this.offScreen();
  }

  // Return the live position vector (not a copy) so update() can mutate it.
  get position() { return this.__position; }
  set position(position) { this.__position = position; }
}
