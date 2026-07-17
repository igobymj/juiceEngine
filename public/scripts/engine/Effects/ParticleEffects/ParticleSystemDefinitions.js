/* ParticleSystemDefinitions.js

pure data for defining particle systems
created by MJ 7/26/22

*/

export default class ParticleSystemDefinitions {

	constructor() {

		//singleton
		if(ParticleSystemDefinitions.__instance) {
			return ParticleSystemDefinitions.__instance;
		}

		ParticleSystemDefinitions.__instance = this;

	    // defaults. TODO: should be in JSON separate file eventually
	    // I'd like to eliminate the "container" syntax if possible
	    this.__particleSystem = {
	    	asteroidHit: {
	    		vectorParticle: {
	    			shape : "circle",
	    			count : 10,
	    			size: 10,
	    			pattern : "radial",
	    			rotation : "random",
	    			rotationSpeed: 5,
	    			particleLife : 1.0,
	    			initialVelocityRandom: true,
	    			initialVelocity : 60,
	    			fade : true,
	    			followObject : false
	    		}
	    	}
	    };

	}


	// all juice features are based on "events". Generally the form will be string, string, boolean or number
	// in the case of cheats like invulnerability, the "event" is just called "cheats"
	// updateJuice(eventName, effectName, effectParameter, status) {

	// 	// if (this exists) 
	// 	this.container[eventName][effectName][effectParameter] = status;

	// 	// probably good to keep this around
	// 	// maybe in time have something like this display at the bottom of the page and fade out?
	// 	// don't print "active" because that is boring
	// 	if( effectParameter != "active") {
	// 		console.log(eventName + " " + effectName + " " + effectParameter + ": " + this.container[eventName][effectName][effectParameter]);
	// 	}

	// }

	get particleSystem() {
		return this.__particleSystem;
	}

}
