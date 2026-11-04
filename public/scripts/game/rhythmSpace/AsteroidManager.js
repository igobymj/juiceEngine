/*
 * AsteroidManager — spawns, moves, and despawns Rhythm Space asteroids.
 *
 * Asteroids are now authored objects: each rock is built from an 'obstacle' PulseObject
 * prototype (RtdManager.obstacleDefs / obstacleDef) rather than a hardcoded type. A wave is
 * a handful of rocks drawn from the obstacle prototypes in the scene; they drift and despawn
 * off-screen, and a fresh wave respawns once the field is clear. When a rock is destroyed it
 * spawns the prototype named by its definition's `spawns` (bare name) with probability
 * `spawnProbability` — the authorable replacement for the old fixed large→medium→small split.
 *
 * Registered as an update + render system; the app enables it only in game/editor mode and
 * kicks off the first wave via start() when a play mode is entered.
 */

import Manager from "../../engine/Managers/Manager.js";
import Asteroid from "./Asteroid.js";

const LEVEL_START_ROCKS = 5;
const LEVEL_RESET_DELAY = 3000;   // ms after the field is cleared before a new wave

// Fallback rock when no obstacle prototype exists yet (so the field is never empty).
const DEFAULT_DEF = { name: 'asteroid', size: 60, color: '#8a8580', driftMin: 0, driftMax: 1.5, spinMin: 0, spinMax: 0.015, pulseScale: 1.3, relax: 0.16, spawns: 'none', spawnProbability: 0 };

export default class AsteroidManager extends Manager {
  constructor(gameSession, opts = {}) {
    super(gameSession);
    this.__asteroids = [];
    this.__resetTime = 0;
    this.__started = false;
    this.event = opts.event ?? null;   // juice event fired on a hit (particles, shake, …)
    // Automatic wave spawning + empty-field respawn. DISABLED — a bespoke spawn-authoring
    // system will replace it. The manager stays live (existing rocks still drift/collide,
    // spawnAsteroid/spawnFromName still work for previews and future authored spawns); only the
    // automatic population is off. Flip to true (or pass { autoSpawn:true }) to restore.
    this.autoSpawn = opts.autoSpawn ?? false;
  }

  get asteroids() { return this.__asteroids; }

  // The obstacle definitions a wave draws from — the scene's obstacle prototypes, or the
  // built-in fallback rock if none are authored yet.
  _waveDefs() {
    const rtd = this.gameSession.rtdManager;
    const defs = rtd && typeof rtd.obstacleDefs === 'function' ? rtd.obstacleDefs() : [];
    return defs.length ? defs : [DEFAULT_DEF];
  }

  // Kick off the first wave (called once when a play mode is first entered, when the canvas
  // dimensions are known). Later waves come from the empty-field respawn.
  start() {
    if (this.__started || !this.autoSpawn) return;
    this.__started = true;
    this.levelStart();
  }

  levelStart() {
    if (!this.autoSpawn) return;   // automatic waves disabled pending the spawn-authoring system
    const w = this.gameSession.canvasWidth;
    const h = this.gameSession.canvasHeight;
    const defs = this._waveDefs();
    for (let i = 0; i < LEVEL_START_ROCKS; i++) {
      const def = defs[Math.floor(Math.random() * defs.length)];
      this.spawnAsteroid(def, Math.random() * w, Math.random() * h);
    }
  }

  spawnAsteroid(def, x, y) {
    this.__asteroids.push(new Asteroid(this.gameSession, def, x, y));
  }

  // Spawn a rock from a prototype's bare name (the on-destroy `spawns` target). No-op for
  // 'none' or an unresolvable name.
  spawnFromName(name, x, y) {
    if (!name || name === 'none') return;
    const rtd = this.gameSession.rtdManager;
    const def = rtd && typeof rtd.obstacleDef === 'function' ? rtd.obstacleDef(name) : null;
    if (def) this.spawnAsteroid(def, x, y);
  }

  update() {
    // Respawn a wave a short while after the field is cleared (only when auto-spawn is on).
    if (this.autoSpawn && this.__asteroids.length === 0) {
      if (this.__resetTime === 0) {
        this.__resetTime = this.gameSession.timeManager.time + LEVEL_RESET_DELAY;
      } else if (this.gameSession.timeManager.time >= this.__resetTime) {
        this.__resetTime = 0;
        this.levelStart();
      }
    }

    for (let i = this.__asteroids.length - 1; i >= 0; i--) {
      if (!this.__asteroids[i].update()) this.__asteroids.splice(i, 1);   // despawn off-screen
    }
  }

  explode(asteroid) {
    // The juice event carries the effects (particle burst, screen shake).
    if (this.event) this.gameSession.juiceEventManager.addNew(this.event, asteroid);
  }

  // Destroy the asteroid at index i: fire the hit event, roll its authored spawn (the `spawns`
  // prototype at `spawnProbability`), and remove it. Shared by direct hits and AOE blasts.
  _destroy(i) {
    const a = this.__asteroids[i];
    if (!a) return;
    this.explode(a);
    if (a.spawns !== 'none' && Math.random() < a.spawnProbability) {
      this.spawnFromName(a.spawns, a.position.x, a.position.y);
    }
    this.__asteroids.splice(i, 1);
  }

  // Radius-based hit test for a moving projectile (a disc of `radius` at `center`): the
  // index of the first asteroid it overlaps, or -1. Circle-vs-circle against each rock's
  // body (~0.42 of its bounding diagonal), which is robust and cheap.
  projectileHit(center, radius) {
    const p5 = this.gameSession.p5;
    for (let i = 0; i < this.__asteroids.length; i++) {
      const a = this.__asteroids[i];
      if (p5.dist(center.x, center.y, a.position.x, a.position.y) <= radius + a.diagonal * 0.42) return i;
    }
    return -1;
  }

  // Destroy the asteroid at index i — a direct projectile hit.
  destroyAt(i) { this._destroy(i); }

  // Area-of-effect blast (an exploding projectile): destroy every asteroid whose body falls
  // within `radius` of `center`, exploding and spawning each like a direct hit.
  explodeArea(center, radius) {
    let hit = false;
    const p5 = this.gameSession.p5;
    for (let i = this.__asteroids.length - 1; i >= 0; i--) {
      const a = this.__asteroids[i];
      if (p5.dist(center.x, center.y, a.position.x, a.position.y) > radius + a.diagonal / 2) continue;
      this._destroy(i);
      hit = true;
    }
    return hit;
  }

  render() {
    for (const a of this.__asteroids) a.render();
  }
}
