/*
 * Shell — the four-measure gun's projectile.
 *
 * A slow, large round that flies along a fixed heading and detonates on contact with an
 * asteroid or at the end of its range, dealing an area-of-effect blast (asteroidManager
 * .explodeArea) that destroys every rock within its AOE radius. Speed and AOE radius are
 * set per shot from the firing object's editor params. Like the RTD Bullet it owns its
 * own position vector (no screen wrapping) rather than leaning on the asteroids pipeline.
 */

import VectorGameObject from "../../engine/VectorGameObject.js";

const SHELL_DURATION = 4000;   // ms of flight before it detonates at end of range
const SHELL_SIZE = 12;         // half-extent (px) — clearly larger than a bullet

export default class Shell extends VectorGameObject {
  constructor(gameSession, position, angle, opts = {}) {
    const s = SHELL_SIZE;
    const vertices = [
      { x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s },
    ];
    super(gameSession, position.x, position.y, vertices, true, 1, true, angle, 1, 255);

    this.__position = this.p5.createVector(position.x, position.y);
    this.__velocity = p5.Vector.fromAngle(angle, opts.speed ?? 0.3);   // px per ms (slow)
    this.aoe = opts.aoe ?? 90;                                         // blast radius (px)
    this.__color = opts.color ?? '#e0567b';
    this.__radius = s;
    this.__startTime = this.gameSession.timeManager.time;
    this.__duration = opts.duration ?? SHELL_DURATION;
    this.__deltaDistance = this.p5.createVector(0, 0);
  }

  expired() {
    return (this.gameSession.timeManager.time - this.__startTime) >= this.__duration;
  }

  offScreen() {
    const m = this.__radius;
    const w = this.gameSession.canvasWidth, h = this.gameSession.canvasHeight;
    const p = this.__position;
    return p.x < -m || p.x > w + m || p.y < -m || p.y > h + m;
  }

  // Returns false when the shell should be removed. Detonates on an asteroid hit or when
  // its range runs out; a shell that merely leaves play fizzles without a blast.
  update() {
    this.__deltaDistance.set(this.velocity.x, this.velocity.y).mult(this.gameSession.timeManager.deltaTime);
    this.position.add(this.__deltaDistance);

    const asteroids = this.gameSession.asteroidManager;
    if (asteroids && asteroids.collide(this, false)) { this._detonate(); return false; }
    if (this.expired()) { this._detonate(); return false; }
    if (this.offScreen()) return false;
    return true;
  }

  _detonate() {
    const asteroids = this.gameSession.asteroidManager;
    if (asteroids && typeof asteroids.explodeArea === 'function') {
      asteroids.explodeArea(this.__position, this.aoe);
    }
  }

  render() {
    const p = this.p5;
    p.push();
    p.noStroke();
    p.fill(this.__color);
    p.circle(this.__position.x, this.__position.y, this.__radius * 2);
    p.pop();
  }

  get position() { return this.__position; }
  set position(position) { this.__position = position; }
  get velocity() { return this.__velocity; }
  set velocity(velocity) { this.__velocity = velocity; }
}
