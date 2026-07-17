
/* Creates a particle effect (can have multiple particles, but all have the same behavior).

Takes effect parameters (array) and the triggering object (mostly to get its position but sometimes orientation, velocity, etc)

TODO: should be extended into inherited class from "particle" (which currently does not exist)

*/


import VectorParticle from "./VectorParticle.js";
import HelperFunctions from "../../HelperFunctions.js";

/* takes two arguments: gameSession, the effect parameters object, and the triggering object */
export default class VectorParticleEffect {

    constructor(gameSession, effectParameters, triggerObject) {

        //a particle effect gets an X/Y; its duration is based on
        //the lifespan of the actual particles

        this.__gameSession = gameSession;

        this.__particles = new Array();

        this.__positionVector = this.gameSession.p5.createVector(triggerObject.position.x, triggerObject.position.y);
        this.__velocityVector = this.gameSession.p5.createVector(triggerObject.velocity.x, triggerObject.velocity.y)

        this.__effectParameters = effectParameters;

        this.initiateEffect();

    }

    finished() {
        if( this.particles.length <= 1 ) { 
            return true;
        }
        else {
            return false;
        }
    }

    update() {

        for(let i = this.particles.length - 1; i >=0; i-- ){
            if(this.particles[i].finished()){
                this.particles.splice(i, 1);
            }
            else{
                this.particles[i].update();
            }
        }

    }

    render() {
        
        for(let i = this.particles.length - 1; i >=0; i-- ){
            this.particles[i].render();
        }

    }

     initiateEffect( ) {

           let count = this.effectParameters.vectorParticle.count;

           for(let i=0; i<count; i++ ) {
               let tempObject = this.spawnParticle(i);
               this.particles.push(tempObject);
           }
     }


     spawnParticle( particleIndex ) {

            let shape = this.effectParameters.vectorParticle.shape;
            let lifeSpan = this.effectParameters.vectorParticle.particleLife * 1000; //convert to milliseconds
            lifeSpan = lifeSpan / 3; // web form uses integers, which is way too long
            let size = this.effectParameters.vectorParticle.size;
            let positionVec = this.positionVector;

            let rotationSpeed = this.effectParameters.vectorParticle.rotationSpeed;
                if( this.effectParameters.vectorParticle.rotation === "random" ) {
                    rotationSpeed = (Math.random()-0.5) * rotationSpeed;
                }

            // begin by determining direction of velocity vector
            let xVel;
            let yVel;
            if( this.effectParameters.vectorParticle.pattern === "radial") {
                let theta = 2*3.1415927 / this.effectParameters.vectorParticle.count;
                xVel = Math.sin(theta * particleIndex);
                yVel = Math.cos(theta * particleIndex); 
            }
            else {
                xVel = (Math.random()-0.5);
                yVel = (Math.random()-0.5);
            }
           let velocity = this.gameSession.p5.createVector(xVel, yVel);
           
           if( this.effectParameters.vectorParticle.inheritVelocity === true) {
               this.velocityVector.setMag(Math.random()+0.5);
               velocity.add(this.velocityVector);            
            }


           // add speed to velocity vector
           velocity.mult(this.effectParameters.vectorParticle.initialVelocity);
           if(this.effectParameters.vectorParticle.initialVelocityRandom === true ) {
                velocity.mult(Math.random()); //may want to tune this
            }

            let particleVertices;
        
            switch( shape ) {
                case "square":
                    particleVertices = [
                        { x: -size, y: size },
                        { x: size, y: size },
                        { x: size, y: -size },
                        { x: -size, y: -size },
                    ];
                break;
                case "triangle" : 
                    particleVertices = [
                        { x: -size, y: size/2 },
                        { x: size, y: size/2},
                        { x: 0, y: -size}
                    ];
                break;
                case "line" : 
                    particleVertices = [
                        { x: -size, y: size/2 },
                        { x: size, y: size/2},
                    ];
                break;
                default: 
                    particleVertices = [
                        {x:0, y:0},
                        {x:0, y:1},
                        {x:1, y:1},
                        {x:1, y:0}
                    ];
            }

        //  constructor(shape, duration, size, position, rotationSpeed, startVelocity, strokeWeight, fill, fade, particleVertices )

        let gravity = this.effectParameters.vectorParticle.gravity || false;
        let fill = this.effectParameters.vectorParticle.fill || false;

        let particle = new VectorParticle(this.gameSession, shape,lifeSpan,size, positionVec,rotationSpeed,velocity, 1, fill, true, particleVertices, gravity);

        // Color resolution priority:
        //   1. Per-system `color` (any CSS/hex string) — wins if defined.
        //   2. Per-system `hue` (legacy 0–360), with sillyColors override.
        //   3. Particle's default white.
        const colorHex = this.effectParameters.vectorParticle.color;
        const sillyColors = this.gameSession.juiceSettings.container.sillyColors;
        let colorObj = null;
        if (colorHex) {
            colorObj = this.gameSession.p5.color(colorHex);
        } else {
            let hue = this.effectParameters.vectorParticle.hue;
            if (sillyColors.active && sillyColors.particleHue > 0) hue = sillyColors.particleHue;
            const rgb = HelperFunctions.HueToRGB(hue);
            if (rgb) colorObj = this.gameSession.p5.color(rgb[0], rgb[1], rgb[2]);
        }
        if (colorObj) {
            particle.fillColor = colorObj;
            particle.strokeColor = colorObj;
        }

        return particle;

     }


    get effectParameters() {
        return this.__effectParameters;
    }

    get particles() {
        return this.__particles;
    }

    get positionVector() {
        return this.__positionVector;
    }

    get velocityVector() {
        return this.__velocityVector;
    }

    get gameSession() {
        return this.__gameSession;
    }

 }



