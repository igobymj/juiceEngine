/*
	HeartbeatSound class

	Synthesized two-tone heartbeat inspired by the original Asteroids coin-op.
	Alternates between a low (~55Hz) and high (~70Hz) square-wave pulse.
	Tempo is controlled externally via setTempo(bpm).

	Extends SoundObject for connect()/dispose() compatibility.
*/

import SoundObject from "../../../engine/sounds/SoundObject.js";

const PULSE_DURATION = 0.08; // seconds per beat pulse

export default class HeartbeatSound extends SoundObject {
	constructor(gameSession) {
		super(gameSession);

		this.__output.set({ volume: 8 });

		// Two square oscillators at different pitches
		this.__oscLow = new Tone.Oscillator(46, "triangle");
		this.__oscHigh = new Tone.Oscillator(50, "triangle");

		// ADSR 0.02, 0.1, 0.025, 0.2

		// Amplitude envelopes — short pulse, fast release
		this.__envLow = new Tone.AmplitudeEnvelope({
			attack: 0.02,
			decay: PULSE_DURATION,
			sustain: .025,
			release: 0.2
		}).connect(this.__output);

		this.__envHigh = new Tone.AmplitudeEnvelope({
			attack: 0.02,
			decay: PULSE_DURATION,
			sustain: 0.025,
			release: 0.2
		}).connect(this.__output);

		this.__oscLow.connect(this.__envLow).start();
		this.__oscHigh.connect(this.__envHigh).start();

		// Alternates 0 (low) / 1 (high)
		this.__beatIndex = 0;

		// Tone.Loop handles scheduling
		this.__loop = new Tone.Loop((time) => {
			if (this.__beatIndex === 0) {
				this.__envLow.triggerAttackRelease(PULSE_DURATION, time);
			} else {
				this.__envHigh.triggerAttackRelease(PULSE_DURATION, time);
			}
			this.__beatIndex = (this.__beatIndex + 1) % 2;
		}, "4n");

		this.__playing = false;
	}

	play() {
		if (this.__playing) return;
		this.__playing = true;
		this.__beatIndex = 0;
		Tone.getTransport().start();
		this.__loop.start(0);
	}

	stop() {
		if (!this.__playing) return;
		this.__playing = false;
		this.__loop.stop();
	}

	setTempo(bpm) {
		Tone.getTransport().bpm.value = bpm;
	}

	get playing() {
		return this.__playing;
	}

	dispose() {
		this.stop();
		this.__loop.dispose();
		this.__envLow.dispose();
		this.__envHigh.dispose();
		this.__oscLow.dispose();
		this.__oscHigh.dispose();
		this.__output.dispose();
	}
}
