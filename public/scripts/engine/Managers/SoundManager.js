/*
	SoundManager class

	Base mixer with main, sfx, and music channels.
	Games register their sounds via registerSound().

	By Jonathan Leland
	Last Updated 2/24/26 by Michael John — extracted engine base class
*/

import Manager from "./Manager.js";

export default class SoundManager extends Manager {
	constructor(gameSession) {
		// (singleton guard removed — multiple instances allowed)

		super(gameSession);

		SoundManager.__instance = this;

		this.__instance = {};

		//Mixer channels
		this.__mainMix = new Tone.Volume().toDestination();
		this.__sfxMix = new Tone.Volume().connect(this.__mainMix);
		this.__musicMix = new Tone.Volume(-12).connect(this.__mainMix);

		// Registered sounds storage
		this.__sounds = {};

		if (this.gameSession.verbose === true) {
			console.log("sound manager created successfully");
		}
	}

	// Register a named sound object on a channel
	registerSound(name, soundObject, channel = "sfx") {
		const mix = channel === "music" ? this.__musicMix : this.__sfxMix;
		soundObject.connect(mix);
		this.__sounds[name] = soundObject;
	}

	getSound(name) {
		return this.__sounds[name];
	}

	// Names of all registered sounds — used to populate the juice editor's
	// sound-clip dropdown.
	names() {
		return Object.keys(this.__sounds);
	}

	get sfxMix() {
		return this.__sfxMix;
	}

	get musicMix() {
		return this.__musicMix;
	}

	get mainMix() {
		return this.__mainMix;
	}

	setMusicVolume(db) {
		this.__musicMix.volume.value = db;
	}

	// --- Global mute (app-agnostic) ---
	// Every app's SoundManager feeds Tone's single master output, so muting there
	// silences all sound everywhere regardless of which app/session is active.
	static setMuted(muted) {
		SoundManager.__muted = !!muted;
		Tone.getDestination().mute = SoundManager.__muted;
	}

	static get muted() {
		return !!SoundManager.__muted;
	}

	static toggleMute() {
		SoundManager.setMuted(!SoundManager.muted);
		return SoundManager.muted;
	}

	get instance() {
		return this.__instance;
	}

	set instance(instance) {
		this.__instance = instance;
	}
}
