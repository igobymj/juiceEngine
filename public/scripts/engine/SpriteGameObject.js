// SpriteGameObject
// super class for displaying any sprite in game

/* 
	Inherits from GameObject.js
	Any sprite image should be loaded in the preload() function and will be referenced here
*/

import GameObject from "./GameObject.js";


export default class SpriteGameObject extends GameObject {

	/* Constructor */
	// Parameters are: sprite (must be P5 object of type image), float x, float y, float rotation (radians), float scale, int alpha (between 0 and 255)
	constructor( spriteName, x, y, rotation, scale, alpha) {

		// calls GameObject Constructor. Note that size is passed as 0,0 which could become a problem if there's collision (TODO add manual width/height setting in constructor)
		super(x, y, 0, 0, rotation, scale, alpha );

		this.__spriteImage = this.gameSession.spriteManager.getSprite(spriteName);
		this.__width = this.__spriteImage.width;
		this.__height = this.__spriteImage.height;
		this.__alpha = alpha;

		//scaling is done locally; again this will mess up collision in GameObject, potentially
		this.__width *= scale;
		this.__height *= scale;

	}

	// following the pattern in VectorGameObject, there is no update() override in this class

	render() {
		
		//rotation is messy, requires translation etc
		this.p5.image(this.spriteImage, this.x, this.y, this.width/2, this.height/2 );
		
	}

	get spriteImage() {
		return this.__spriteImage;
	}

	set spriteImage( sprite ) {
		this.__spriteImage = sprite; // right now this is useless, could change image however if there's a cloneimage function in helpers
	}

	// overrides of width/height getters from GameObject
	get width () {
		return this.__width;
	}
	get height () {
		return this.__height;
	}

	get alpha() {
		return this.__alpha;
	}




}
