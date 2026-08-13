/*
 * Asteroid — an RTD obstacle.
 *
 * A drifting, rotating vector rock in three sizes (large → medium → small). It
 * moves along a fixed random heading and, unlike the asteroids project, does not
 * wrap: update() reports when it has left the screen so the manager can despawn
 * it. Splitting is driven by the manager via nextType. Adapted from the asteroids
 * project's Asteroid so RTD owns it (no eyeballs, no juice-pipeline coupling).
 */

import VectorGameObject from "../../engine/VectorGameObject.js";

const VELOCITY_MAX = { large: 2, medium: 3, small: 4 };
const MOVEMENT_MULTIPLIER = 0.1;   // scales the drift speed (with deltaTime)
const ROTATION_SPEED = 128;        // larger = slower spin

const SHAPES = {
  large: [
    { x: 68, y: -51 }, { x: -3, y: -80 }, { x: -58, y: -51 }, { x: -71, y: 1 },
    { x: -38, y: 62 }, { x: 4, y: 54 }, { x: 17, y: 34 }, { x: 33, y: 49 },
    { x: 68, y: 26 }, { x: 72, y: -8 },
  ],
  medium: [
    { x: -11, y: -41 }, { x: 26, y: -37 }, { x: 45, y: 8 }, { x: 30, y: 30 },
    { x: -8, y: 41 }, { x: -43, y: 11 }, { x: -43, y: -23 }, { x: -19, y: -27 },
  ],
  small: [
    { x: -1, y: -18 }, { x: 7, y: -9 }, { x: 9, y: 0 }, { x: 2, y: 9 },
    { x: -12, y: 13 }, { x: -18, y: 0 }, { x: -10, y: -3 }, { x: -18, y: -10 },
  ],
};

export default class Asteroid extends VectorGameObject {
  constructor(gameSession, type, x, y) {
    super(gameSession, x, y, SHAPES[type] || SHAPES.large, true, 1, false, 0, 1, 255);

    this.__type = type;
    const velMax = VELOCITY_MAX[type] ?? VELOCITY_MAX.large;

    // Random heading + speed (kept as a base vector; scaled per frame in update).
    this.__movementVector = this.p5.createVector(
      (Math.random() - 0.5) * velMax,
      (Math.random() - 0.5) * velMax,
    );
    this.__rotationScale = Math.random() - 0.5;
    this.__rotationSpeed = ROTATION_SPEED;
    this.__deltaDistance = this.p5.createVector(0, 0);
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
    this.__deltaDistance
      .set(this.__movementVector.x, this.__movementVector.y)
      .mult(MOVEMENT_MULTIPLIER * this.gameSession.timeManager.deltaTime);
    this.position.add(this.__deltaDistance);

    this.rotation += (this.p5.PI / this.__rotationSpeed) * this.__rotationScale;

    return !this.offScreen();
  }

  // The size this asteroid splits into when destroyed ("none" = gone for good).
  get nextType() {
    switch (this.__type) {
      case "large": return "medium";
      case "medium": return "small";
      default: return "none";
    }
  }

  // Return the live position vector (not a copy) so update() can mutate it.
  get position() { return this.__position; }
  set position(position) { this.__position = position; }

  get velocity() { return this.__movementVector; }   // alias for effects
}
