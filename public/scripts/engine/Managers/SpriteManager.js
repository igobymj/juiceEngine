// SpriteManager
// Container class for images

import Manager from "./Manager.js";

export default class SpriteManager extends Manager {

	constructor(gameSession) {
		if(SpriteManager.__instance) {
			return SpriteManager.__instance;
		}

		super(gameSession);

		SpriteManager.__instance = this;

		this.__sprites = [];

		if(this.gameSession.verbose === true) {
			console.log("sprite Manager created successfully");
		}
	}

	// addSprite, takes parameters: string name, p5 image sprite
	addSprite( name, sprite ) {
		this.__sprites[name] = sprite;
	}

	getSprite( name ) {
		return this.__sprites[name];
		//TODO: add error handling, this is brittle
	}



}