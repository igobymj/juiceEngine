

/* nullGameObject.js

Exists solely for debug purposes, but could be used to for example spawn particle effects without the need for a drawn object

*/

import GameObject from "./GameObject.js";


// takes only position (vector), width, height and rotation. The remainder are defaults.
export default class NullGameOjbect extends GameObject {
	
	constructor(gameSession, position, width, height, rotation ) {

		super(gameSession, position.x, position.y, 0, 0, 0, 0, 255);

	}

	update( x, y ) {

		parseInt(x);
		this.x = x;
		this.y = y;
	}

}