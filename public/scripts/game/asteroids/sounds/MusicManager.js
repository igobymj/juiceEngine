/*
	MusicManager class

	Owns the heartbeat synth and sample-based music tracks.
	Connects to the music mix bus via SoundManager.
*/

import HeartbeatSound from "./HeartbeatSound.js";
import SampleSoundObject from "../../../engine/sounds/SampleSoundObject.js";

export default class MusicManager {
	constructor(gameSession) {
		this.__gameSession = gameSession;

		// Output node — will be connected to SoundManager's __musicMix
		this.__output = new Tone.Volume();

		// Heartbeat synth
		this.__heartbeat = new HeartbeatSound(gameSession);
		this.__heartbeat.connect(this.__output);

		// Sample-based music track
		this.__track = null;
		this.__currentTrackUrl = null;
	}

	get heartbeat() {
		return this.__heartbeat;
	}

	startHeartbeat() {
		this.__heartbeat.play();
	}

	stopHeartbeat() {
		this.__heartbeat.stop();
	}

	setHeartbeatTempo(bpm) {
		this.__heartbeat.setTempo(bpm);
	}

	loadTrack(url) {
		// Stop and dispose existing track first
		if (this.__track) {
			this.__track.stop();
			this.__track.dispose();
			this.__track = null;
		}
		this.__currentTrackUrl = url;
		this.__pendingPlay = false;
		if (!url) return;

		this.__track = new SampleSoundObject(this.__gameSession, url, {
			loop: true,
			volume: 0,
			onload: () => {
				if (this.__pendingPlay) {
					this.__track.play();
					this.__pendingPlay = false;
				}
			}
		});
		this.__track.connect(this.__output);
	}

	playTrack() {
		if (!this.__track) return;
		// If not loaded yet, set a flag so onload will trigger play
		if (!this.__track.__loaded) {
			this.__pendingPlay = true;
		} else {
			this.__track.play();
		}
	}

	stopTrack() {
		this.__pendingPlay = false;
		if (this.__track) this.__track.stop();
	}

	connect(node) {
		this.__output.connect(node);
	}

	dispose() {
		this.__heartbeat.dispose();
		if (this.__track) {
			this.__track.stop();
			this.__track.dispose();
		}
		this.__output.dispose();
	}
}
