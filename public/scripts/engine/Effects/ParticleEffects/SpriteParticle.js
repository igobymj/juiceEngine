// SpriteParticle — draws sprite images via direct p5 calls.
// Extends Particle (lightweight base) instead of SpriteGameObject.

import Particle from "./Particle.js";

export default class SpriteParticle extends Particle {

    // particleName: string key for spriteManager lookup
    // x, y: spawn position
    // rotation: initial rotation (radians)
    // scale: render scale
    // moveVector: p5.Vector velocity
    // duration: lifetime in seconds
    // alpha: initial alpha (0–255)
    constructor(gameSession, particleName, x, y, rotation, scale, moveVector, duration, alpha) {

        const p5 = gameSession.p5;
        const position = p5.createVector(x, y);
        const durationMs = duration * 1000;

        // Particle base: (gameSession, position, velocity, rotation, rotationSpeed, scale, alpha, duration, fade)
        super(gameSession, position, moveVector, rotation, rotation, scale, alpha, durationMs, true);

        this.__spriteImage = gameSession.spriteManager.getSprite(particleName);
        this.__width = this.__spriteImage.width * scale;
        this.__height = this.__spriteImage.height * scale;
    }

    render() {
        const p = this.p5;

        p.push();
        p.translate(this.position.x, this.position.y);
        p.rotate(this.rotation);
        p.scale(this.scale);
        p.tint(255, this.alpha);
        p.image(this.__spriteImage, 0, 0, this.__width, this.__height);
        p.noTint();
        p.pop();
    }
}
