/* 
ParticleSystem

Instantiates a particle system based on a game event's definition in JuiceSettings.js

***FOR NOW a system can only have one particle definition (but multiple particles obv)***

The hierarchy is:
 Event -> System -> Effect -> Particle

Particle systems will eventually include multiple objects, also data-driven

*/


import VectorParticleEffect from "./VectorParticleEffect.js";


export default class ParticleSystem {


	// takes gameSession, eventName (string), and triggerObject (location vector, size, rotation)
	constructor( gameSession, eventName, triggerObject ) {

        this.__gameSession = gameSession;

        // note that only the x and y location of the object are used for particle fx
		this.__triggerObject = triggerObject;
		this.__eventName = eventName;


        // these two fields are needed for updates in the juiceEventManager
        this.__effectName = "particles";
        this.__active = this.__gameSession.juiceSettings.container[eventName].particles.active; // do we need this? shouldn't it just be 'true'?

        this.__particleEffects = new Array();

		if( this.__gameSession.juiceSettings.container[eventName].particles.particleSystem === null) {
			console.log("particle system for ", eventName, " is invalid");
		}

		this.initiateSystem();

	}

	finished() {
		if( this.particleEffects.length <= 0 ) { 
			return true;
		}
		else {
			return false;
		}
	}

	// for the moment because a system can have only one effect, this is pretty redundant and simple
	initiateSystem() {

       	let particleEffectObject = this.particleEffectFactory();
   		this.particleEffects.push(particleEffectObject);

  	}


	update() {

		for(let i = this.particleEffects.length - 1; i >=0; i-- ){
            if(this.particleEffects[i].finished()){
                this.particleEffects.splice(i, 1);
            }
            else{
                this.particleEffects[i].update();
            }
        }

	}

	render() {
		for(let i = this.particleEffects.length - 1; i >=0; i-- ){
            this.particleEffects[i].render();
        }
	}


	// named as a factory to accommodate a future world of more than just vector particles. For now it's a bit of false advertising
	particleEffectFactory() {

		let effectReference = this.gameSession.juiceSettings.container[this.eventName].particles.particleSystem;
		let effectParameters = this.gameSession.juiceSettings.particleSystems[effectReference];

		// pass a single object to the effect, it returns an array of vector particles 
		return new VectorParticleEffect(this.gameSession, effectParameters, this.triggerObject);

	}



	get particleEffects() {
		return this.__particleEffects;
	}

	get effectName () {
		return this.__effectName;
	}

	get active() {
		return this.__active;
	}

	get definition () {
		return this.__definition;
	}

	get eventName() {
		return this.__eventName;
	}

	get triggerObject() {
		return this.__triggerObject;
	}

	get gameSession() {
		return this.__gameSession;
	}


}