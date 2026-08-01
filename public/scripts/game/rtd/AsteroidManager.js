/*
 * AsteroidManager — spawns, moves, and despawns RTD asteroids.
 *
 * Adapted from the asteroids project, RTD-owned: asteroids drift and despawn when
 * they leave the screen (no wrapping), and a fresh wave respawns once they're all
 * gone. `collide()` is called by bullets; a hit plays the explosion sound, spawns
 * a particle burst, splits the rock into two smaller ones, and removes it.
 *
 * Registered as an update + render system; the app enables it only in game mode
 * and kicks off the first wave via start() when game mode is entered.
 */

import Manager from "../../engine/Managers/Manager.js";
import Asteroid from "./Asteroid.js";

const LEVEL_START_ROCKS = 5;
const LEVEL_RESET_DELAY = 3000;   // ms after the field is cleared before a new wave

export default class AsteroidManager extends Manager {
  constructor(gameSession, opts = {}) {
    super(gameSession);
    this.__asteroids = [];
    this.__resetTime = 0;
    this.__started = false;
    this.event = opts.event ?? null;   // juice event fired on a hit (particles, shake, …)
  }

  get asteroids() { return this.__asteroids; }

  // Kick off the first wave (called once when game mode is first entered, when the
  // canvas dimensions are known). Later waves come from the empty-field respawn.
  start() {
    if (this.__started) return;
    this.__started = true;
    this.levelStart();
  }

  levelStart() {
    const w = this.gameSession.canvasWidth;
    const h = this.gameSession.canvasHeight;
    for (let i = 0; i < LEVEL_START_ROCKS; i++) {
      this.spawnAsteroid(1, "large", Math.random() * w, Math.random() * h);
    }
  }

  spawnAsteroid(count, type, x, y) {
    for (let i = 0; i < count; i++) {
      this.__asteroids.push(new Asteroid(this.gameSession, type, x, y));
    }
  }

  update() {
    // Respawn a wave a short while after the field is cleared.
    if (this.__asteroids.length === 0) {
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

  // Called by bullets (destroyAsteroids=true): checks collision against every
  // asteroid, and on a hit explodes it, splits it, and removes it.
  collide(gameObject, destroyAsteroids) {
    let collision = false;
    for (let i = this.__asteroids.length - 1; i >= 0; i--) {
      if (!this.__asteroids[i].collide(gameObject)) continue;
      collision = true;
      if (destroyAsteroids) {
        const a = this.__asteroids[i];
        this.explode(a);
        if (a.nextType !== "none") this.spawnAsteroid(2, a.nextType, a.position.x, a.position.y);
        this.__asteroids.splice(i, 1);
      }
    }
    return collision;
  }

  explode(asteroid) {
    // The juice event carries the effects (particle burst, screen shake).
    if (this.event) this.gameSession.juiceEventManager.addNew(this.event, asteroid);
  }

  render() {
    for (const a of this.__asteroids) a.render();
  }
}
