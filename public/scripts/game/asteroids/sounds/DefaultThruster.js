import SoundObject from "../../../engine/sounds/SoundObject.js";
/*
	DefaultThruster class

	Singleton default thruster SoundObject, filtered noise plus an oscillator.
	Played and stopped separately.

	By Jonathan Leland
	Last Updated 5/2/2022
*/

export default class DefaultThruster extends SoundObject{
	/* Constructor */
	constructor(gameSession){
		if(DefaultThruster.__instance){
			return DefaultThruster.__instance;
		}

		super(gameSession);
		DefaultThruster.__instance = this;

		this.__instance = {}; //DefaultThruster instance

		// Set initial volume level
		this.__output.set({volume: 0});

		// Amplitude envelope
		this.__env.set({
			attack: 0.1,
			release: 0.1,
			releaseCurve: "linear",
		});
		// Bandpass filter
		this.__filter = new Tone.BiquadFilter({
			Q: 1.0,
			frequency: 110,
			type: "bandpass",
		}).connect(this.__env);
		// Noise generator
		this.__noise = new Tone.Noise("brown").connect(this.__filter).start();
		// Oscillator gain
		this.__oscGain = new Tone.Gain(0.1).connect(this.__env);
		// Oscillator
		this.__osc = new Tone.Oscillator(110, "triangle").connect(this.__oscGain).start();
	}

	play(){
		this.__env.triggerAttack();
	}

	stop(){
		this.__env.triggerRelease()
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