// Particle.js — Lightweight base class for all particles.
// Does NOT extend GameObject. Owns only what every particle needs:
// position, velocity, rotation, scale, alpha, duration, fade, and lifetime check.

export default class Particle {

    constructor(gameSession, position, velocity, rotation, rotationSpeed, scale, alpha, duration, fade) {
        this.__gameSession = gameSession;
        this.__p5 = gameSession.p5;
        this.__timeManager = gameSession.timeManager;

        this.__position = position.copy();  // p5.Vector — own copy, mutated directly
        this.__velocity = velocity.copy(); // p5.Vector — own copy, mutated directly
        this.__rotation = rotation;
        this.__rotationSpeed = rotationSpeed;
        this.__scale = scale;
        this.__scaleSpeed = 0;             // per-frame scale delta; set via setter
        this.__alpha = alpha;
        this.__duration = duration;        // milliseconds
        this.__fade = fade;

        this.__startTime = this.__timeManager.time;
    }

    // Returns true when the particle's lifetime has expired
    finished() {
        return (this.__timeManager.time - this.__startTime) >= this.__duration;
    }

    // Base physics: movement, rotation, fade, scale animation
    update() {
        const dt = this.__timeManager.deltaTime;

        // Position
        const dx = this.__p5.createVector(this.__velocity.x, this.__velocity.y);
        dx.mult(dt);
        this.__position.add(dx);

        // Rotation
        this.__rotation += this.__rotationSpeed * dt;

        // Fade
        if (this.__fade) {
            const fadePercent = (this.__timeManager.time - this.__startTime) / this.__duration;
            this.__alpha = 255 - (255 * fadePercent);
        }

        // Scale animation
        if (this.__scaleSpeed !== 0) {
            this.__scale += this.__scaleSpeed * dt;
        }
    }

    // Abstract — children must override
    render() {
        console.warn("Particle.render() called — subclass must override.");
    }

    // Getters / setters
    get gameSession() { return this.__gameSession; }
    get p5()          { return this.__p5; }
    get position()    { return this.__position; }
    get velocity()    { return this.__velocity; }

    get rotation()        { return this.__rotation; }
    set rotation(v)       { this.__rotation = v; }

    get rotationSpeed()   { return this.__rotationSpeed; }
    set rotationSpeed(v)  { this.__rotationSpeed = v; }

    get scale()           { return this.__scale; }
    set scale(v)          { this.__scale = v; }

    get scaleSpeed()      { return this.__scaleSpeed; }
    set scaleSpeed(v)     { this.__scaleSpeed = v; }

    get alpha()           { return this.__alpha; }
    set alpha(v)          { this.__alpha = v; }

    get duration()        { return this.__duration; }
    get fade()            { return this.__fade; }
}
