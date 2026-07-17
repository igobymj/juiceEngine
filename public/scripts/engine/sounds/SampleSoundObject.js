/*
	SampleSoundObject class

	Wraps Tone.Player for audio file playback.
	Connects Player → PanVol output directly, bypassing the amplitude envelope
	since audio files have their own baked-in dynamics.

	Slots into SoundClass pools interchangeably with synth-based SoundObjects.
*/

import SoundObject from "./SoundObject.js";

export default class SampleSoundObject extends SoundObject {
	constructor(gameSession, url, options = {}) {
		super(gameSession);

		this.__output.set({ volume: options.volume ?? -12 });

		// Optional reverb: Player → Reverb → output
		if (options.reverb) {
			this.__reverb = new Tone.Reverb({
				decay: options.reverb.decay ?? 2,
				wet: options.reverb.wet ?? 0.5
			}).connect(this.__output);
		}

		this.__player = new Tone.Player({
			url: url,
			loop: options.loop ?? false,
			onload: () => {
				this.__loaded = true;
				if (options.onload) options.onload();
			}
		}).connect(this.__reverb ?? this.__output);

		this.__loaded = false;
	}

	play() {
		if (this.__loaded && this.__player.state !== "started") {
			this.__player.start();
		}
	}

	stop() {
		if (this.__player.state === "started") {
			this.__player.stop();
		}
	}

	dispose() {
		this.__player.stop();
		this.__player.dispose();
		if (this.__reverb) this.__reverb.dispose();
		this.__output.dispose();
	}
}
