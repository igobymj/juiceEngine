/* JuiceEvent Manager

Handles both creation/[destruction] of juice effects, and update of the effects

CREATION: takes a juice event by name, uses factory pattern to instantiate the correct effect, 

UPDATE: enumerates 'effectors' array, removes "finished" events from array, and calls effectors' update and render methods

Created 6/15/22 by MJ
Updated: 1/31/26

*/

/* NOTE: This obviates the need for MANAGERs for each type of effect. Each effect's system is fully managed by this manager, which
uses a factory pattern to support a variety of different effects.

*/


import Manager from "./Manager.js";
import ScreenShakeEffector from "../Effects/ScreenShake/ScreenShakeEffector.js";
import ColorFlashEffector from "../Effects/ColorFlash/ColorFlashEffector.js";
import ParticleSystem from "../Effects/ParticleEffects/ParticleSystem.js";
import TimeSlowEffector from "../Effects/TimeEffects/TimeSlowEffector.js";
import DeconstructEffector from "../Effects/Deconstruct/DeconstructEffector.js";
import FloatingScoreEffector from "../Effects/Score/FloatingScoreEffector.js";

// Maps effect names to their effector classes.
// Each class constructor follows the signature: (gameSession, eventName, triggerObject)
const effectTypes = {
	shake: ScreenShakeEffector,
	colorFlash: ColorFlashEffector,
	particles: ParticleSystem,
	timeSlow: TimeSlowEffector,
	deconstruct: DeconstructEffector,
	floatingScore: FloatingScoreEffector,
};

export default class JuiceEventManager extends Manager {

	constructor(gameSession) {

		// singleton constructor
		if (JuiceEventManager.__instance) {
			return JuiceEventManager.__instance;
		}

		super(gameSession);

		JuiceEventManager.__instance = this;

		this.__effectors = new Array();
		// array of ints to hold number of effects currently in play. Avoids inappropriate stacking of
		// certain effects.
		this.__effectSemaphors = [];
		this.__shakeSemaphore = false; // screen shakes should be allowed to complete before another shake is fired

		if (this.gameSession.verbose === true) {
			console.log("juice event Manager created successfully");
		}

	}

	update() {

		// iterates backwards for removing element in-place when necessary
		for (let i = this.effectors.length - 1; i >= 0; i--) {
			if (this.effectors[i].finished()) {
				this.effectors.splice(i, 1);
			}
			else {
				this.effectors[i].update();
			}
		}
	}

	render() {

		for (let i = this.effectors.length - 1; i >= 0; i--) {
			this.effectors[i].render();
		}
	}


	//add new effect (push onto array)
	//interface is string, object. String is required, object is optional
	addNew(eventName, triggerObject) {

		// global juice toggle – skip all effects when master switch is off
		if (!this.gameSession.juiceSettings.container.cheats.juiceFx) return;

		// ensure that this event exists
		if (eventName in this.gameSession.juiceSettings.container) {
			// a given event may have more than one effect/system. Iterate through each
			for (let effectName in this.gameSession.juiceSettings.container[eventName]) {
				// create an effect object and push it onto effectors[] array
				if (this.gameSession.juiceSettings.container[eventName][effectName].active === true) {
					if (effectName === "shake" && this.shakeSemaphore === true) {
						continue;
					}
					else {
						let effectObject = this.newEventFactory(eventName, effectName, triggerObject);
						// hit pause runs its own timer so will not be included in this array (returns null)
						if (effectObject != null) {
							this.effectors.push(effectObject);
						}
						this.effectSemaphors[effectName] = true;
					}
				}
			}
		}
		else {
			console.log("ERROR: " + eventName + " event is not defined in juiceSettings");
		}

	}

	// Factory function for various effect types.
	// Uses the effectTypes map to instantiate the correct class.
	// hitPause is handled separately since it doesn't create an effector object.
	newEventFactory(eventName, effectName, triggerObject) {

		if (effectName === "hitPause") {
			this.gameSession.gameUpdate.delayFrames = this.gameSession.juiceSettings.container[eventName].hitPause.frames;
			return null;
		}

		const EffectorClass = effectTypes[effectName];
		if (EffectorClass) {
			return new EffectorClass(this.gameSession, eventName, triggerObject);
		}

		console.log("error creating effect: " + eventName + " " + effectName);
		return false;
	}

	// getters/setters
	get effectors() {
		return this.__effectors;
	}

	set effectors(effectors) {
		this.__effectors = effectors;
	}

	get effectSemaphors() {
		return this.__effectSemaphors;
	}

	set effectSemaphors(effectSemaphor) {
		this.__effectSemaphors = effectSemaphors;
	}

	get shakeSemaphore() {
		return this.__shakeSemaphore;
	}

	set shakeSemaphore(shakeSemaphore) {
		this.__shakeSemaphore = shakeSemaphore;
	}

}
