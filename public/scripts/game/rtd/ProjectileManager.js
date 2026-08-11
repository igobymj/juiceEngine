/*
 * ProjectileManager — owns RTD's flying projectiles.
 *
 * The ship's manual shot (fire) and a launcher's authored projectile (spawn) both create a
 * Projectile and share one update/render list. Registered as an update + render system; the
 * app enables it only in game mode.
 */

import Projectile from "./Projectile.js";

const AMMO_LIMIT = 6;

// Default definition for the ship's manual shot: a small fast projectile.
const SHIP_SHOT = { shape: 'circle', fill: true, size: 4, color: '#ffffff', speed: 1, explodes: false, lifetime: 800 };

export default class ProjectileManager {
  constructor(gameSession, opts = {}) {
    this.gs = gameSession;
    this.__projectiles = [];
    this.ammoLimit = opts.ammoLimit ?? AMMO_LIMIT;
    this.event = opts.event ?? null;   // juice event fired on the ship's shot (sound + effects)
  }

  get projectiles() { return this.__projectiles; }

  // The player's manual shot from the ship, at `position` (p5.Vector) along `angle`.
  // Ammo-limited; fires the juice event (sound). Pass { event: false } to skip the event.
  fire(position, angle, opts = {}) {
    if (this.__projectiles.length >= this.ammoLimit) return;
    this.__projectiles.push(new Projectile(this.gs, position, angle, SHIP_SHOT));
    if (this.event && opts.event !== false) {
      this.gs.juiceEventManager.addNew(this.event, {
        position: this.gs.p5.createVector(position.x, position.y),
        velocity: this.gs.p5.createVector(0, 0),
      });
    }
  }

  // Spawn a projectile from an authored definition (a launcher's attached projectile). `def`
  // carries shape/fill/size/color/speed/explodes/aoeRadius/lifetime/spinSpeed/beatpulse
  // (+ launcherPulseScale). Shares the list; not ammo-limited (launchers fire on-grid).
  spawn(position, angle, def = {}) {
    this.__projectiles.push(new Projectile(this.gs, position, angle, def));
  }

  update() {
    for (let i = this.__projectiles.length - 1; i >= 0; i--) {
      if (!this.__projectiles[i].update()) this.__projectiles.splice(i, 1);   // dead / timed out
    }
  }

  render() {
    for (const p of this.__projectiles) p.render();
  }
}
