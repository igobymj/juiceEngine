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
		if (SoundManager.__instance) {
			return SoundManager.__instance;
		}

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

	get instance() {
		return this.__instance;
	}

	set instance(instance) {
		this.__instance = instance;
	}
}
