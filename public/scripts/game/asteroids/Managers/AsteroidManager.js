// AsteroidManager.
// Used to spawn and despawn asteroids
// Nothing inherits from this
// Last modified by Eddie 5/7/22

import Manager from "../../../engine/Managers/Manager.js";
import Asteroid from "../Asteroid.js";
import {
    LEVEL_START_ROCKS,
    LEVEL_RESET_DELAY,
    SAFE_SPAWN_DISTANCE,
    ASTEROID_SPAWN_RANGE
} from "../gameplayConstants.js";


export default class AsteroidManager extends Manager{

	constructor(gameSession) {
		// (singleton guard removed — engine is de-singletoned; one per session)
		super(gameSession);

		//Instance Variables
		this.__asteroids = new Array(); //holds asteroids

		//Gameplay Variables
		//Number of large asteroids at level start
		this.__levelStartRocks = LEVEL_START_ROCKS;

		this.__resetTime = 0;
		this.__resetDelay = LEVEL_RESET_DELAY;

		if( this.gameSession.verbose === true ) {
			console.log("asteroid Manager created successfully");
		}
	}

	levelStart() {

		for ( let i=0; i < this.__levelStartRocks; i++ ) {
			this.spawnAsteroid( 1, "large", Math.random() * ASTEROID_SPAWN_RANGE, Math.random() * ASTEROID_SPAWN_RANGE);
		}

	}

	update() {
		
		if( this.asteroids.length === 0 ) {
			if( this.resetTime === 0 ) {
				this.resetTime = this.gameSession.timeManager.time + this.__resetDelay;
			}
			if( this.gameSession.timeManager.time >= this.resetTime ) {
				this.resetTime = 0;
				this.levelStart();
			}

		}

		for( let i = this.asteroids.length - 1; i >= 0; i-- ) {
			if( this.asteroids[i].update() != null ) {
				this.asteroids.splice(i,1);
			}
		}

		// Update heartbeat tempo based on remaining asteroids
		if( this.gameSession.juiceSettings.container.music.track === 'heartbeat'
			&& this.gameSession.juiceSettings.container.cheats.juiceFx ) {
			this.gameSession.soundManager.updateHeartbeatTempo(this.asteroids.length);
		}
	}
	

	// returns true if no asteroids are within 200 units of the center of the screen
	safeToSpawn(x, y) {

		x = this.gameSession.canvasWidth/2;
		y = this.gameSession.canvasHeight/2;

		let centerVec = new p5.Vector(x,y);

		// test each asteroid to see how far it is (x,y) from screen center
		for( let i = this.asteroids.length - 1; i >= 0; i-- ) {
			if( p5.Vector.dist(centerVec, this.asteroids[i].position)  < SAFE_SPAWN_DISTANCE  ) {
				// not safe to spawn/respawn the ship just yet
				return false;
			}
		}

		// no asteroids failed the test, therefore spawning is safe
		return true;

	}
	
	// collide method is used by other entities to check collision with asteroids, e.g.
	// bullets and player ship. collide() is *not* called from inside this class
	collide( gameObject, destroyAsteroids ) {
		// This handles the edge case of collision detection with multiple asteroids at once
		let collision = false;
		
		// since the array might be shortened, be sure to iterate it backwards
		for( let i = this.asteroids.length - 1; i >= 0; i-- ) {
			if(this.asteroids[i].collide(gameObject)){
				collision = true;
				if(destroyAsteroids){
					// asteroidHit carries the (now data-driven) explosion sound.
					this.gameSession.juiceEventManager.addNew("asteroidHit", this.asteroids[i]);
					this.gameSession.scoreManager.addScore(this.asteroids[i]);
					if( this.asteroids[i].nextType === "none"
						&& this.gameSession.juiceSettings.container.cheats.juiceFx
						&& this.gameSession.juiceSettings.container.sillySounds.pewpewpew) {
						this.gameSession.soundManager.playCheer();
					}
					if( this.asteroids[i].nextType != "none") {
						this.spawnAsteroid(2, this.asteroids[i].nextType, this.asteroids[i].position.x, this.asteroids[i].position.y)
					}
					this.asteroids.splice(i,1);
				}
			}
		}
		return collision;
	}

	// create asteroids 
	// takes number of asteroids to spawn, what type (size) they are, and the x/y coordinates of the spawn point
	spawnAsteroid( asteroidCount, type, x, y ) {
		for( let i=0; i<asteroidCount; i++ ) {
			// if ship is alive, go for it. If this is a reset, make sure it's a safe spawn
			if( this.gameSession.shipManager.ship.shipAlive || this.safeToSpawn() ) {
				this.asteroids.push(new Asteroid(this.gameSession, type, x, y));
			}
		}
	}

	render() {
		for( let i=0; i<this.asteroids.length; i++ ) {
			this.asteroids[i].render();
		}
	}

	//getters and setters
	get asteroids() {
		return this.__asteroids;
	}

	get resetTime() {
		return this.__resetTime;
	}

	set resetTime(resetTime) {
		this.__resetTime = resetTime;
	}

}

