// juiceSettings.js
// Base container object for juice settings. Subclass and override
// createDefaultContainer() / createDefaultParticleSystems() for game-specific events.
// created by MJ 6/2/22
// updated by MJ 2/24/26 — extracted engine base class


export default class JuiceSettings {

	constructor() {

		//singleton
		if (JuiceSettings.__instance) {
			return JuiceSettings.__instance;
		}

		JuiceSettings.__instance = this;

		this.__instance = {};

		// defaults — subclasses extend via createDefaultContainer/createDefaultParticleSystems
		this.__container = this.createDefaultContainer();
		this.__particleSystems = this.createDefaultParticleSystems();

		console.log("default juice settings created");

	}

	// Override in subclass to add game-specific events
	createDefaultContainer() {
		return {
			cheats: {
				juiceFx: false,
				ship: {
					invincibility: true
				},
				score: {
					pulse: false,
					pulseScale: 1.3,
					multiplier: 1,
					fontSize: 64,
					slotMachine: false
				}
			}
		};
	}

	// Override in subclass to add game-specific particle systems
	createDefaultParticleSystems() {
		return {
			particleTest: {
				vectorParticle: {
					shape: "circle",
					count: 15,
					size: 10,
					pattern: "radial",
					rotation: "random",
					rotationSpeed: 5,
					particleLife: 2,
					initialVelocityRandom: false,
					initialVelocity: 30,
					fade: true,
					followObject: false
				}
			}
		};
	}

	// Merge additional settings into the container (for runtime extension)
	extend(config) {
		this._deepMerge(this.__container, config);
	}

	// Merge additional particle systems
	extendParticleSystems(systems) {
		this._deepMerge(this.__particleSystems, systems);
	}

	_deepMerge(target, source) {
		for (const key of Object.keys(source)) {
			if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
				&& target[key] && typeof target[key] === 'object') {
				this._deepMerge(target[key], source[key]);
			} else {
				target[key] = source[key];
			}
		}
	}

	// all juice features are based on "events". Generally the form will be string, string, boolean or number
	// in the case of cheats like invulnerability, the "event" is just called "cheats"
	updateJuice(eventName, effectName, effectParameter, status) {

		// if (this exists)
		this.container[eventName][effectName][effectParameter] = status;

		// probably good to keep this around
		// maybe in time have something like this display at the bottom of the page and fade out?
		// don't print "active" because that is boring
		if (effectParameter != "active") {
			console.log(eventName + " " + effectName + " " + effectParameter + ": " + this.container[eventName][effectName][effectParameter]);
		}

	}

	updateParticleSystem(eventName, effectName, effectParameter, status) {

		this.particleSystems[eventName][effectName][effectParameter] = status;

		console.log(eventName + " " + effectName + " " + effectParameter + ": " + this.particleSystems[eventName][effectName][effectParameter]);

	}

	//getters & setters
	get juiceSettings() {
		return this.__juiceSettings;
	}

	set juiceSettings(settings) {
		this.__juiceSettings = settings;
	}

	get container() {
		return this.__container;
	}

	set container(container) {
		this.__container = container;
	}

	get particleSystems() {
		return this.__particleSystems;
	}

	set particleSystems(particleSystems) {
		this.__particleSystems = particleSystems;
	}



}
