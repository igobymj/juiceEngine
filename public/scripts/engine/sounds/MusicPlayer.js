/*
	MusicPlayer class

	A generic looping music track player. Loads an audio file, loops it, and
	plays/stops on demand. Registered on SoundManager's music channel, so the
	shared master mute and setMusicVolume apply to it.

	This is the app-agnostic track player — the asteroids MusicManager bundles a
	procedural heartbeat on top; this one is just the track, for apps (like RTD)
	that only need to pick and play a file.
*/

import SampleSoundObject from "./SampleSoundObject.js";

export default class MusicPlayer {
	constructor(gameSession, options = {}) {
		this.__gameSession = gameSession;

		// Native Tone looping by default. Pass { loop: false } to loop the track manually
		// instead (e.g. RTD re-fires it on a downbeat — see makeMusicLoop).
		this.__loop = options.loop ?? true;

		// Output node — connected to SoundManager's __musicMix via registerSound.
		this.__output = new Tone.Volume();

		this.__track = null;
		this.__currentUrl = null;
		this.__pendingPlay = false;
	}

	get currentUrl() {
		return this.__currentUrl;
	}

	// Track length in seconds (0 until loaded), for scheduling a manual loop.
	get duration() {
		return this.__track ? this.__track.duration : 0;
	}

	// Point the player at a track (a media URL, or falsy/'none' to clear it).
	// Disposes any previous track first. Does not start playback on its own.
	loadTrack(url) {
		if (this.__track) {
			this.__track.stop();
			this.__track.dispose();
			this.__track = null;
		}
		this.__pendingPlay = false;
		this.__currentUrl = (url && url !== 'none') ? url : null;
		if (!this.__currentUrl) return;

		this.__track = new SampleSoundObject(this.__gameSession, this.__currentUrl, {
			loop: this.__loop,
			volume: 0,
			onload: () => {
				if (this.__pendingPlay) {
					const opts = this.__pendingPlay;
					this.__pendingPlay = false;
					this.__track.play(typeof opts === 'function' ? opts() : opts);
				}
			},
		});
		this.__track.connect(this.__output);
	}

	// Start the track (deferring until onload if it's still loading). `opts` is
	// { at?, offset? } (an audio-clock start time / seconds into the track) OR a
	// function returning that, resolved at the moment playback actually begins — so a
	// caller can beat-snap correctly even if the track was still loading when called.
	// See the RTD music drop (tryDropMusic). No opts → start now from the top.
	playTrack(opts = {}) {
		if (!this.__track) return;
		if (!this.__track.__loaded) { this.__pendingPlay = opts; return; }
		this.__track.play(typeof opts === 'function' ? opts() : opts);
	}

	stopTrack() {
		this.__pendingPlay = false;
		if (this.__track) this.__track.stop();
	}

	connect(node) {
		this.__output.connect(node);
	}

	dispose() {
		if (this.__track) {
			this.__track.stop();
			this.__track.dispose();
		}
		this.__output.dispose();
	}
}
