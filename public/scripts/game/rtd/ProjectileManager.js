/*
 * ProjectileManager — owns RTD's bullets.
 *
 * Bullet (RTD's own) flies along a fixed heading, leaves play at the edges, and
 * times out. `fire(position, angle)` spawns one and plays the fire sound.
 * Registered as an update + render system; the app enables it only in game mode.
 *
 * NOTE: Bullet.update() asks gameSession.asteroidManager whether it hit anything,
 * so a (currently stub) asteroidManager must be registered. Asteroids come next.
 */

import Bullet from "./Bullet.js";
import Shell from "./Shell.js";

const AMMO_LIMIT = 6;

export default class ProjectileManager {
  constructor(gameSession, opts = {}) {
    this.gs = gameSession;
    this.__bullets = [];
    this.ammoLimit = opts.ammoLimit ?? AMMO_LIMIT;
    this.event = opts.event ?? null;   // juice event fired on each shot (sound + effects)
  }

  get bullets() { return this.__bullets; }

  // Spawn a bullet at `position` (p5.Vector) travelling along `angle` (radians).
  // Pass { event: false } to skip the fire juice event (e.g. a downbeat gun that carries
  // its own selected sound and shouldn't also trigger the generic bullet-fire sound).
  fire(position, angle, opts = {}) {
    if (this.__bullets.length >= this.ammoLimit) return;
    this.__bullets.push(new Bullet(this.gs, position, angle));
    if (this.event && opts.event !== false) {
      this.gs.juiceEventManager.addNew(this.event, {
        position: this.gs.p5.createVector(position.x, position.y),
        velocity: this.gs.p5.createVector(0, 0),
      });
    }
  }

  // Spawn a slow, large AOE shell (the four-measure gun). opts: { speed, aoe, color }.
  // Shares the projectile list/update/render; not ammo-limited since it fires rarely.
  fireShell(position, angle, opts = {}) {
    this.__bullets.push(new Shell(this.gs, position, angle, opts));
  }

  update() {
    for (let i = this.__bullets.length - 1; i >= 0; i--) {
      if (!this.__bullets[i].update()) this.__bullets.splice(i, 1);   // dead / timed out
    }
  }

  render() {
    for (const b of this.__bullets) b.render();
  }
}
