/*
 * Bullet — an RTD projectile.
 *
 * A small VectorGameObject that flies along a fixed heading set at spawn, dies
 * when it leaves the screen or after a short lifetime, and asks the (RTD)
 * asteroidManager whether it hit anything. Adapted from the asteroids project's
 * bullet so RTD owns it outright: no screen wrapping, and no dependency on the
 * asteroids juice pipeline.
 */

import VectorGameObject from "../../engine/VectorGameObject.js";

const BULLET_DURATION = 800;   // ms before it expires

export default class Bullet extends VectorGameObject {
  constructor(gameSession, position, angle) {
    const vertices = [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 },
    ];
    super(gameSession, position.x, position.y, vertices, true, 1, true, angle, 1, 255);

    this.__position = this.p5.createVector(position.x, position.y);
    this.__velocity = p5.Vector.fromAngle(angle, 1);   // px per ms (scaled by deltaTime)
    this.__startTime = this.gameSession.timeManager.time;
    this.__duration = BULLET_DURATION;
    this.__deltaDistance = this.p5.createVector(0, 0);
  }

  expired() {
    return (this.gameSession.timeManager.time - this.__startTime) >= this.__duration;
  }

  offScreen() {
    const margin = this.diagonal / 2;
    const w = this.gameSession.canvasWidth;
    const h = this.gameSession.canvasHeight;
    const p = this.__position;
    return p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin;
  }

  // Returns false when the bullet should be removed (expired, off-screen, or hit).
  update() {
    if (this.expired()) return false;

    this.__deltaDistance.set(this.velocity.x, this.velocity.y).mult(this.gameSession.timeManager.deltaTime);
    this.position.add(this.__deltaDistance);

    const asteroids = this.gameSession.asteroidManager;
    if (asteroids && asteroids.collide(this, true)) return false;   // hit (asteroids added later)

    if (this.offScreen()) return false;   // no wrapping — bullet leaves play
    return true;
  }

  render() {
    super.render();
  }

  get position() { return this.__position; }
  set position(position) { this.__position = position; }
  get velocity() { return this.__velocity; }
  set velocity(velocity) { this.__velocity = velocity; }
}
