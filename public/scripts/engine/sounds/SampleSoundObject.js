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

		// Encode the URL before handing it to Tone/fetch: a raw path with a
		// space (or other URI-significant character) fails to load, so a track
		// like "Sunlit Urban Groove.mp3" silently never plays. encodeURI keeps
		// the path structure (slashes, scheme) intact and is a no-op on the
		// plain relative paths this project already uses.
		this.__player = new Tone.Player({
			url: encodeURI(url),
			loop: options.loop ?? false,
			onload: () => {
				this.__loaded = true;
				if (options.onload) options.onload();
			}
		}).connect(this.__reverb ?? this.__output);

		this.__loaded = false;
	}

	play(opts = {}) {
		if (!this.__loaded) return;
		if (opts.volume != null) this.__output.set({ volume: opts.volume });
		if (opts.rate != null) this.__player.playbackRate = opts.rate;
		// Restart from the top so rapid re-triggers still sound. opts.at (audio time,
		// seconds) schedules the start — e.g. on a beat; opts.offset (seconds) starts
		// that far into the buffer. Both undefined → start now from the top.
		this.__player.stop();
		this.__player.start(opts.at, opts.offset);
	}

	stop() {
		if (this.__player.state === "started") {
			this.__player.stop();
		}
	}

	// Track length in seconds (0 until the buffer has loaded). Lets a caller schedule
	// against the end of the clip — e.g. a manual, downbeat-aligned music loop.
	get duration() {
		return (this.__loaded && this.__player.buffer) ? this.__player.buffer.duration : 0;
	}

	dispose() {
		this.__player.stop();
		this.__player.dispose();
		if (this.__reverb) this.__reverb.dispose();
		this.__output.dispose();
	}
}
