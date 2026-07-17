// VectorParticle — draws shapes via direct p5 calls.
// Extends Particle (lightweight base) instead of VectorGameObject.

import Particle from "./Particle.js";
import HelperFunctions from "../../HelperFunctions.js";

export default class VectorParticle extends Particle {

    constructor(gameSession, shape, duration, size, position, rotationSpeed, startVelocity, strokeWeight, fill, fade, particleVertices, gravity) {

        if (size === null) {
            size = 1;
        }
        if (particleVertices === null) {
            particleVertices = [
                { x: -size, y: size },
                { x: size, y: size },
                { x: size, y: -size },
                { x: -size, y: -size },
            ];
        }

        // Scale velocity and rotation to match original behavior
        startVelocity.mult(.005);
        const scaledRotationSpeed = rotationSpeed * .005;

        // Particle base: (gameSession, position, velocity, rotation, rotationSpeed, scale, alpha, duration, fade)
        super(gameSession, position, startVelocity, 0, scaledRotationSpeed, 1, 255, duration, fade);

        // Convert vertex data to p5.Vector array
        this.__vertices = HelperFunctions.Point2VectorArray(this.p5, particleVertices);
        this.__shape = shape;
        this.__strokeWeight = strokeWeight;
        this.__fill = fill;
        this.__strokeColor = this.p5.color(255);
        this.__fillColor = this.p5.color(255);
        this.__size = size;
        this.__closeShape = true;

        // Acceleration vector — multiplied into velocity each frame
        this.__accelerationVector = this.p5.createVector(1.02, 1.02);
        this.__gravity = gravity || false;
    }

    update() {
        // Apply acceleration before base physics
        this.velocity.mult(this.__accelerationVector);

        // Apply gravity (downward force)
        if (this.__gravity) {
            this.velocity.y += 0.006;
        }

        // Base physics: position, rotation, fade, scale
        super.update();
    }

    render() {
        const p = this.p5;

        p.push();
        p.translate(this.position.x, this.position.y);
        p.rotate(this.rotation);
        p.scale(this.scale);

        // Stroke
        p.strokeWeight((1 / this.scale) * this.__strokeWeight);
        p.stroke([p.red(this.__strokeColor), p.green(this.__strokeColor), p.blue(this.__strokeColor), this.alpha]);

        // Fill
        if (this.__fill) {
            p.fill([p.red(this.__fillColor), p.green(this.__fillColor), p.blue(this.__fillColor), this.alpha]);
        } else {
            p.noFill();
        }

        // Draw shape
        if (this.__shape === "circle" || this.__shape === "dot") {
            p.ellipse(0, 0, this.__size);
        } else {
            p.beginShape();
            for (let i = 0; i < this.__vertices.length; i++) {
                p.vertex(this.__vertices[i].x, this.__vertices[i].y);
            }
            if (this.__closeShape) {
                p.endShape(p.CLOSE);
            } else {
                p.endShape();
            }
        }

        p.pop();
    }

    get strokeColor() { return this.__strokeColor; }
    set strokeColor(c) { this.__strokeColor = c; }

    get fillColor() { return this.__fillColor; }
    set fillColor(c) { this.__fillColor = c; }
}
