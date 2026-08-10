/*
 * Projectile — a gun's shot, built from an authored projectile definition.
 *
 * One parameterised projectile replaces the old fixed Bullet/Shell split: appearance
 * (shape/fill/size/color, borrowed from the particle system) and behaviour (speed,
 * explode-on-impact + AOE radius, lifetime) and animation (spin, beat-pulse) all come
 * from the definition the firing gun references. Extends VectorGameObject so it collides
 * with asteroids like the other projectiles; render() draws the chosen shape itself.
 */

import VectorGameObject from "../../engine/VectorGameObject.js";
import PulseObject from "./PulseObject.js";

export default class Projectile extends VectorGameObject {
  constructor(gameSession, position, angle, def = {}) {
    const size = def.size ?? 8;
    const shape = def.shape || 'circle';
    const verts = PulseObject.projectileShapeVerts(shape, size);
    super(gameSession, position.x, position.y, verts, true, 1, def.fill !== false, angle, 1, 255);

    this.__position = this.p5.createVector(position.x, position.y);
    this.__velocity = p5.Vector.fromAngle(angle, def.speed ?? 0.6);   // px per ms
    this.__verts = verts;
    this.__shape = shape;
    this.__size = size;
    this.__fill = def.fill !== false;
    this.__color = def.color || '#ffffff';
    this.__explodes = !!def.explodes;
    this.__aoe = def.aoeRadius ?? 90;
    this.__lifetime = def.lifetime ?? 1500;
    this.__spin = def.spinSpeed ?? 0;                                   // radians per ms
    this.__rot = 0;
    // Beat-pulse amplitude relative to the firing gun (0 = none, 0.5 = the gun's pulse,
    // 1.0 = double it): pulse scale = 1 + 2*beatpulse*(gunPulseScale - 1).
    this.__pulseAmt = 2 * (def.beatpulse ?? 0) * ((def.gunPulseScale ?? 1) - 1);
    this.__pulse = 1;
    this.__start = gameSession.timeManager.time;
    this.__delta = this.p5.createVector(0, 0);
    this.__lastBeat = this._beatTime();
  }

  // Most recent master beat time (for the beat-pulse), on the grid clock.
  _beatTime() {
    const g = this.gameSession.rtdManager && this.gameSession.rtdManager.beatGrid;
    if (!g || !g.masterInterval) return -Infinity;
    const t = this.gameSession.timeManager.realTimeSinceStartup;
    return g.epoch + Math.floor((t - g.epoch) / g.masterInterval) * g.masterInterval;
  }

  expired() { return (this.gameSession.timeManager.time - this.__start) >= this.__lifetime; }

  offScreen() {
    const m = this.__size + 2;
    const w = this.gameSession.canvasWidth, h = this.gameSession.canvasHeight, p = this.__position;
    return p.x < -m || p.x > w + m || p.y < -m || p.y > h + m;
  }

  // Returns false when the projectile should be removed. An exploder detonates (AOE) on
  // contact or at end of range; a plain projectile destroys the rock it hits.
  update() {
    const dt = this.gameSession.timeManager.deltaTime;
    this.__delta.set(this.__velocity.x, this.__velocity.y).mult(dt);
    this.position.add(this.__delta);
    this.__rot += this.__spin * dt;

    if (this.__pulseAmt) {
      const b = this._beatTime();
      if (b > this.__lastBeat) { this.__lastBeat = b; this.__pulse = 1 + this.__pulseAmt; }
      this.__pulse += (1 - this.__pulse) * 0.18;   // ease back to rest
    }

    const asteroids = this.gameSession.asteroidManager;
    if (this.__explodes) {
      if (asteroids && asteroids.collide(this, false)) { this._detonate(); return false; }
      if (this.expired()) { this._detonate(); return false; }
    } else {
      if (asteroids && asteroids.collide(this, true)) return false;
      if (this.expired()) return false;
    }
    if (this.offScreen()) return false;
    return true;
  }

  _detonate() {
    const a = this.gameSession.asteroidManager;
    if (a && typeof a.explodeArea === 'function') a.explodeArea(this.__position, this.__aoe);
  }

  render() {
    const p = this.p5;
    const c = p.color(this.__color);
    p.push();
    p.translate(this.__position.x, this.__position.y);
    p.rotate(this.__rot);
    p.scale(this.__pulse);
    if (this.__fill) { p.noStroke(); p.fill(c); } else { p.noFill(); p.stroke(c); p.strokeWeight(2); }
    if (this.__shape === 'circle') {
      p.ellipse(0, 0, this.__size * 2);
    } else {
      p.beginShape();
      for (const v of this.__verts) p.vertex(v.x, v.y);
      if (this.__shape !== 'line') p.endShape(p.CLOSE); else p.endShape();
    }
    p.pop();
  }

  get position() { return this.__position; }
  set position(position) { this.__position = position; }
  get velocity() { return this.__velocity; }
  set velocity(velocity) { this.__velocity = velocity; }
}
