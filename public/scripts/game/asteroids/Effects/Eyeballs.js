
/* 
	eyeballsEffector.js


	container to render all eyeball objects, based on X/Y of this asteroid, and X/Y of player ship. Takes position and size parameterss
*/


import EllipseGameObject from "../../../engine/EllipseGameObject.js";




export default class Eyeballs {

	constructor( gameSession, position, size ) {

		this.__gameSession = gameSession;

		this.__eyeball = new EllipseGameObject( gameSession, position, size, size, 0, 1, 255, "gray", true );

		this.__pupil = new EllipseGameObject( gameSession, position, size/4, size/4, 0, 1, 255, "red", true );

		this.__eyeballSize = size;

		// Reusable scratch vectors to avoid per-frame allocations
		this.__scratchEyeVec = gameSession.p5.createVector(0, 0);
		this.__scratchPupilVec = gameSession.p5.createVector(0, 0);

	}


	update( x, y ) {
		
		// send X and Y
		this.eyeball.update( x, y );

		// calculate pupil position
		// reuse scratch vectors instead of allocating new ones each frame
		let shipPos = this.gameSession.shipManager.ship.position;
		this.__scratchEyeVec.set(x, y);
		// vector that points from eyeball to ship
		this.__scratchPupilVec.set(shipPos.x - x, shipPos.y - y);
		// normalize resulting vector...
		this.__scratchPupilVec.normalize();
		// then multiply it so that it sits in a nice creepy place
		this.__scratchPupilVec.mult(this.__eyeballSize/4);
		// don't forget to actually move the pupil :)
		this.__scratchPupilVec.add(this.__scratchEyeVec);
		// and finally... update
		this.pupil.update(this.__scratchPupilVec.x, this.__scratchPupilVec.y);

	}


	render() {
		this.eyeball.render();
		this.pupil.render();
	}

	get eyeball() {
		return this.__eyeball;
	}

	get pupil() {
		return this.__pupil;
	}

	get gameSession() {
		return this.__gameSession;
	}

	get eyeballSize() {
		return this.__eyeballSize;
	}




}