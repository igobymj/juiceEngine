// ship.js 
// this class controls the draw and movement of the player ship. 
// inherits from VectorGameObject
// nothing inherits from this class
// By MJ
// last modified 6/15/22 by MJ

import VectorGameObject from "../../engine/VectorGameObject.js";
import {
    SHIP_ROTATION_SPEED,
    SHIP_THRUST_AMOUNT,
    SHIP_SPEED_CLAMP,
    SHIP_DEAD_TIME,
    SHIP_SCALE,
    SHIP_FLAME_RENDER_INTERVAL
} from "./gameplayConstants.js";


export default class Ship extends VectorGameObject {

    // constructor takes the following:
    // p5 object, x and y coordinates of the ship location (rendered from center point), stroke weight (float, default 1),
    // strokeColor (p5.color type object), rotatation (float, represents radians), scale (float) and alpha value (int)
    constructor(gameSession) {

        // ship vertices are hard coded in constructor
        let shipVertices = [
            { x: 24, y: 0 },
            { x: -24, y: -18 },
            { x: -18, y: -4 },
            { x: -18, y: 4 },
            { x: -24, y: 18 },
        ];

        //creates VectorGameObject using above vertices, The remainder of arguments are the same
        //as described above for the constructor, note that coordinates are not set (0,0) as they will be set in spawnShip()
        super(gameSession, 0, 0, shipVertices, true, 1, false, 0, SHIP_SCALE, 255);

        this.__rotationSpeed = SHIP_ROTATION_SPEED;
        this.__thrustAmount = SHIP_THRUST_AMOUNT;
        this.__speedClamp = SHIP_SPEED_CLAMP;

        this.__shipAlive = false;
        this.__deadTime = SHIP_DEAD_TIME;
        this.__deathTimer = this.gameSession.timeManager.realTimeSinceStartup + this.__deadTime;

        // velocity vector
        this.__velocity = this.p5.createVector(0, 0);
        this.__deltaDistance = this.p5.createVector(0, 0);
        this.__rotation = 0;

        // variabless for animating flame effect
        this.__framesSinceFlame = 0;
        this.__thrust = false;
        this.__wasThrusting = false;

        // We also want to have a flame exhaust appear when we move
        // so this array stores the vertices for the flame effect
        this.__flameVertices = [
            { x: -28, y: -11 },
            { x: -34, y: 0 },
            { x: -28, y: 11 },
        ];

        // Create a VectorGameObject to handle drawing the flame exhaust
        this.__flame = new VectorGameObject(gameSession, 0, 0, this.__flameVertices, true, 1 / this.scale, false, 0, 1, 255);

        // Enable black fill so the concave notch at the back of the ship is
        // opaque against the background, matching the original render behavior.
        this.fill = true;
        this.fillColor = this.p5.color(0);

    }


    // update() runs once per frame, called from index.js
    update() {

        this.rotateShip();

        if (this.__shipAlive) {
            // set thrust to "false" as default
            this.__thrust = false;

            if (this.gameSession.inputManager.inputObject.forward === true) {
                this.thrust = true;
                // create an acceleration vector based on the ship's current rotation
                let accelerationVector = p5.Vector.fromAngle(this.rotation);
                // keep acceleration vector's direction but set magnitude to 1
                accelerationVector.normalize();
                // multiply by thrust constant, and adjust for any time dilation/compression
                accelerationVector.mult(this.__thrustAmount * this.gameSession.timeManager.deltaTime);
                // add acceleration (thrust) to current velocity
                this.velocity.add(accelerationVector);

            }

            // Trigger thruster sound on state transitions
            if (this.__thrust && !this.__wasThrusting) {
                this.gameSession.soundManager.playThruster();
            } else if (!this.__thrust && this.__wasThrusting) {
                this.gameSession.soundManager.stopThruster();
            }
            this.__wasThrusting = this.__thrust;

            // apply speed clamp so that the speed doesn't get insane
            if (this.velocity.mag() > this.__speedClamp) {
                this.velocity.setMag(this.__speedClamp);
            }

            // move the ship, using the velocity vector, now is deltaDistance
            this.__deltaDistance.set(this.velocity.x, this.velocity.y).mult(this.gameSession.timeManager.deltaTime);
            this.position.add(this.__deltaDistance);

            // wrapping: check for ship going off the edge of the screen and wrap it back to the opposite side
            super.wrap();

            if (!this.gameSession.juiceSettings.container.cheats.ship.invincibility && this.gameSession.asteroidManager.collide(this, true)) {
                this.destroyShip();
            }
        }

        //spawns the ship the first time and subsequent times after death
        else {
            if (this.gameSession.timeManager.time > this.__deathTimer) {
                this.spawnShip();
            }
        }

    }

    render() {
        if (this.__shipAlive) {
            super.render();

            // Draw flame exhaust inside the same transform context that
            // super.render() has already torn down, so we re-enter it briefly.
            if (this.thrust && this.p5.frameCount % SHIP_FLAME_RENDER_INTERVAL === 0) {
                super.beginRender();
                this.flame.renderVertices();
                super.endRender();
            }
        }
    }

    destroyShip() {
        if (this.__wasThrusting) {
            this.gameSession.soundManager.stopThruster();
            this.__wasThrusting = false;
        }

        this.__shipAlive = false;
        this.__deathTimer = this.gameSession.timeManager.time + this.__deadTime;

        // Pass name of event to Juice Event Manager
        this.gameSession.juiceEventManager.addNew("destroyShip", this);
    }

    spawnShip() {

        let invincible = this.gameSession.juiceSettings.container.cheats.ship.invincibility;

        // first run a test to see if the center of the screen is free of asteroids, then spawn
        //skips over "safeToSpawn" test if invincibility toggle is on
        if (this.gameSession.asteroidManager.safeToSpawn(this.gameSession.canvasWidth / 2, this.gameSession.canvasHeight / 2) || invincible) {
            this.__shipAlive = true;
            this.position.x = this.gameSession.canvasWidth / 2;
            this.position.y = this.gameSession.canvasHeight / 2;
            this.velocity.setMag(0);
        }
    }

    // process input
    rotateShip() {

        if (this.gameSession.inputManager.inputObject.left === true) {
            this.rotation -= this.p5.PI * this.__rotationSpeed * this.gameSession.timeManager.deltaTime;
        }
        if (this.gameSession.inputManager.inputObject.right === true) {
            this.rotation += this.p5.PI * this.__rotationSpeed * this.gameSession.timeManager.deltaTime;
        }
    }

    fireBullet() {
        this.gameSession.bulletManager.fireBullet(this.position, this.rotation);
    }

    // getters & setters
    get rotation() {
        return this.__rotationSpeed;
    }

    get position() {
        return this.__position;
    }

    set position(newPosition) {
        this.__position = newPosition;
    }

    get velocity() {
        return this.__velocity;
    }

    set velocity(newVelocity) {
        this.__velocity = newVelocity;
    }

    get rotation() {
        return this.__rotation;
    }

    set rotation(newRotation) {
        this.__rotation = newRotation;
    }

    get shipAlive() {
        return this.__shipAlive;
    }

    get thrust() {
        // in case it is somehow not set
        if (this.__thrust === null) {
            return false;
        }
        else {
            return this.__thrust;
        }
    }

    get flame() {
        return this.__flame;
    }

    set thrust(newThrust) {
        this.__thrust = newThrust;
    }

    get vertices() {
        return this.__vertices;
    }

    set vertices(newVertices) {
        this.__vertices = newVertices;
    }

}