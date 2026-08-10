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
import Projectile from "./Projectile.js";

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

  // Spawn a projectile from an authored definition (a gun's attached projectile). `def`
  // carries shape/fill/size/color/speed/explodes/aoeRadius/lifetime/spinSpeed/beatpulse
  // (+ gunPulseScale). Shares the projectile list; not ammo-limited (guns fire on-grid).
  spawn(position, angle, def = {}) {
    this.__bullets.push(new Projectile(this.gs, position, angle, def));
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
