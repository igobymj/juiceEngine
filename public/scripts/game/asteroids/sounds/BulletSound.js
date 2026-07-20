import SoundClass from "../../../engine/sounds/SoundClass.js";
import DefaultBullet from "./DefaultBullet.js";
import AlternateBullet from "./AlternateBullet.js";
import SampleSoundObject from "../../../engine/sounds/SampleSoundObject.js";
/*
	BulletSound class

	Singleton BulletSound container, extends SoundClass.

	By Jonathan Leland
	Last Updated 5/2/2022
*/

export default class BulletSound extends SoundClass{
	/* Constructor */
	constructor(gameSession){
		if(BulletSound.__instance){
			return BulletSound.__instance;
		}

		super(gameSession);

		BulletSound.__instance = this;

		this.__instance = {}; //BulletSound instance

		// Index for playing next bullet sound from pool
		this.__poolIndex = 0;
		this.__poolSize = 4;

		// Default bullet (index 0)
		this.__defaultBulletPool = new Array();
		for (let i = 0; i < this.__poolSize; ++i) {
			this.__defaultBulletPool.push(new DefaultBullet(gameSession));
		}
		this.__soundObjects.push(this.__defaultBulletPool);

		// Alternate bullet (index 1)
		this.__alternateBulletPool = new Array();
		for (let i = 0; i < this.__poolSize; ++i) {
			this.__alternateBulletPool.push(new AlternateBullet(gameSession));
		}
		this.__soundObjects.push(this.__alternateBulletPool);

		// Sample bullet — pewpew.wav (index 2)
		this.__sampleBulletPool = new Array();
		for (let i = 0; i < this.__poolSize; ++i) {
			this.__sampleBulletPool.push(new SampleSoundObject(gameSession, "media/audio/pewpew.wav"));
		}
		this.__soundObjects.push(this.__sampleBulletPool);

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