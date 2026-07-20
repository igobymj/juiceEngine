import SoundClass from "../../../engine/sounds/SoundClass.js";
import DefaultThruster from "./DefaultThruster.js";
/*
	ThrusterSound class

	Singleton ThrusterSound object, extends SoundClass.

	By Jonathan Leland
	Last Updated 4/30/2022
*/

export default class ThrusterSound extends SoundClass{
	/* Constructor */
	constructor(gameSession){
		if(ThrusterSound.__instance){
			return ThrusterSound.__instance;
		}

		super(gameSession);

		ThrusterSound.__instance = this;

		this.__instance = {}; //ThrusterSound instance

		// Default thruster sound
		this.__defaultThruster = new DefaultThruster(gameSession);
		this.__defaultThruster.connect(this.__output);
		this.__soundObjects.push(this.__defaultThruster);
	}

	play(){
		this.__soundObjects[this.__activeIndex].play();
	}

	stop(){
		this.__soundObjects[this.__activeIndex].stop();
	}

	dispose(){
		//TODO: dispose of nodes once they are moved to a SoundObject
	}

	get instance(){
		return this.__instance;
	}

	set instance(instance){
		this.__instance = instance;
	}
}