import SoundObject from "./SoundObject.js";
/*
	DefaultExplosion class

	Default explosion sound, pink noise with a bandpass filter sweep.

	By Jonathan Leland
	Last Updated 4/16/2022
*/

export default class DefaultExplosion extends SoundObject{
	/* Constructor */
	constructor(gameSession){
		super(gameSession);

		// Set initial volume level
		this.__output.set({volume: 0});

		// Unscaled settings
		this.__filterFrequency = 60;
		this.__envDuration = 1;

		// Amplitude envelope
		this.__env.set({
			attack: 0,
			release: this.__envDuration,
			releaseCurve: "linear",
		});
		// Bandpass filter
		this.__filter = new Tone.BiquadFilter({
			Q: 1.5,
			frequency: this.__filterFrequency,
			type: "bandpass",
		}).connect(this.__env);
		// Frequency envelope (applied to filter)
		this.__freq = new Tone.FrequencyEnvelope({
			attack: 0,
			baseFrequency: this.__filterFrequency,
			octaves: 2.5,
			release: this.__envDuration,
			releaseCurve: "exponential",
			exponent: 0.01,
		}).connect(this.__filter.frequency);
		// Noise generator
		this.__noise = new Tone.Noise("pink").connect(this.__filter).start();
	}

	play(){
		let timeScale = this.__gameSession.timeManager.timeScale;

		// Adjust frequency based on time scale
		let freq = this.__filterFrequency * timeScale;
		Math.max(Math.min(freq, 10000), 20);
		this.__filter.set({ frequency: freq });
		this.__freq.set({ baseFrequency: freq });

		// Adjust envelope durations based on time scale
		let dur = timeScale > 0 ? this.__envDuration / timeScale : 0;
		dur = Math.max(Math.min(dur, 1.5), 0.01);
		this.__env.release = dur;
		this.__freq.release = dur;

		this.__freq.triggerAttackRelease(0);
		this.__env.triggerAttackRelease(0);
	}

	dispose(){
		//TODO: dispose of nodes once they are moved to a SoundObject
	}
}