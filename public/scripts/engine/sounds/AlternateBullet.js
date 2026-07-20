import SoundObject from "./SoundObject.js";
/*
	AlternateBullet class

	Alternate bullet SoundObject, A sawtooth wave with an upward frequency sweep.

	By Jonathan Leland
	Last Updated 5/2/2022
*/

export default class AlternateBullet extends SoundObject{
	/* Constructor */
	constructor(gameSession){
		super(gameSession);

		// Set initial volume level
		this.__output.set({volume: -24});

		// Unscaled settings
		this.__oscFrequency = 800;
		this.__envDuration = 0.2;

		// Amplitude envelope
		this.__env.set({
			attack: 0,
			release: this.__envDuration,
			releaseCurve: "linear",
		});
		// Oscillator
		this.__osc = new Tone.Oscillator(this.__oscFrequency, "sawtooth").connect(this.__env).start();
		// Frequency envelope
		this.__freq = new Tone.FrequencyEnvelope({
			attack: 0,
			baseFrequency: this.__oscFrequency,
			octaves: -2,
			release: this.__envDuration,
			releaseCurve: "linear",
		}).connect(this.__osc.frequency);
	}

	play(){
		let timeScale = this.__gameSession.timeManager.timeScale;

		// Keep pitch constant
		this.__osc.set({ frequency: this.__oscFrequency });
		this.__freq.set({ baseFrequency: this.__oscFrequency });

		// Stretch envelope duration based on time scale
		let dur = timeScale > 0 ? this.__envDuration / timeScale : 0;
		dur = Math.max(Math.min(dur, 1.5), 0.01);
		this.__env.release = dur;
		this.__freq.release = dur;

		this.__freq.triggerAttackRelease(0);
		this.__env.triggerAttackRelease(0);
	}

	dispose(){
		//TODO: dispose nodes
	}
}