import SoundClass from "../../../engine/sounds/SoundClass.js";
import DefaultExplosion from "./DefaultExplosion.js";
import SampleSoundObject from "../../../engine/sounds/SampleSoundObject.js";

/*
	ExplosionSound class

	Singleton ExplosionSound object, extends SoundClass.

	By Jonathan Leland
	Last Updated 5/2/2022
*/

export default class ExplosionSound extends SoundClass{
	/* Constructor */
	constructor(gameSession){
		if(ExplosionSound.__instance){
			return ExplosionSound.__instance;
		}

		super(gameSession);
		ExplosionSound.__instance = this;

		this.__instance = {}; //ExplosionSound instance

		// Index for playing next explosion sound from pool
		this.__poolIndex = 0;
		this.__poolSize = 4;

		// Default explosion (index 0)
		this.__defaultExplosionPool = new Array();
		for (let i = 0; i < this.__poolSize; ++i) {
			this.__defaultExplosionPool.push(new DefaultExplosion(gameSession));
		}
		this.__soundObjects.push(this.__defaultExplosionPool);

		// Sample explosion — thwump.wav (index 1)
		this.__sampleExplosionPool = new Array();
		for (let i = 0; i < this.__poolSize; ++i) {
			this.__sampleExplosionPool.push(new SampleSoundObject(gameSession, "media/audio/thwump.wav", {
				reverb: { decay: 3, wet: 0.4 }
			}));
		}
		this.__soundObjects.push(this.__sampleExplosionPool);

		// Connect all sound objects
		for (let i = 0; i < this.__soundObjects.length; ++i) {
			for (let j = 0; j < this.__soundObjects[i].length; ++j) {
				this.__soundObjects[i][j].connect(this.__output);
			}
		}
	}

	play(){
		this.__soundObjects[this.__activeIndex][this.__poolIndex].play();
		this.__poolIndex = (this.__poolIndex + 1) % this.__poolSize;
	}

	dispose(){
		//TODO: dispose of SoundObjects, then dispose output with super.dispose() ?
	}

	get instance(){
		return this.__instance;
	}

	set instance(instance){
		this.__instance = instance;
	}
}