// AsteroidsJuiceSettings.js
// Asteroids-specific juice settings extending the engine base.

import JuiceSettings from "../../engine/JuiceSettings.js";

export default class AsteroidsJuiceSettings extends JuiceSettings {

	createDefaultContainer() {
		const base = super.createDefaultContainer();
		return {
			...base,
			bulletHit: {
				particles: {
					active: false,
					particleSystem: "bulletHit"
				},

				shake: {
					active: false,
					xAxis: false,
					yAxis: false,
					duration: 0.5,
					amplitude: 0.5,
					frequency: 10,
					form: "simple",
					fade: false,
					inheritVelocity: false
				},
				hitPause: {
					active: false,
					frames: 0
				},
				colorFlash: {
					active: false,
					color: "white",
					alpha: 200,
					duration: 0.5,
					stackable: false,
					stackWindow: 0.25
				},
				timeSlow: {
					active: false,
					scale: 0.25,
					duration: 0.1
				}
			},
			destroyShip: {
				// Normalized to the engine's standard shake params (was the old
				// intensity/rotation form, which left amplitude/frequency/fade
				// undefined — NaN in the editor and unread by the effector).
				shake: {
					active: false,
					xAxis: true,
					yAxis: true,
					amplitude: 0.5,
					frequency: 10,
					duration: 1.5,
					form: "noise",
					fade: "exponential",
					inheritVelocity: false
				},
				timeSlow: {
					active: false,
					scale: 0.1,
					duration: 3.5,
					stackable: true
				},
				deconstruct: {
					active: false,
					speed: 40,
					rotationSpeed: 0,
					duration: 1.0,
					fade: true,
					drag: 0.98
				}
			},
			asteroidHit: {
				deconstruct: {
					active: false,
					speed: 40,
					rotationSpeed: 0,
					duration: 1.0,
					fade: true,
					drag: 0.98
				},
				// Explosion is now data-driven (was AsteroidManager's imperative
				// playExplosion). Editable/assignable in the sound fold.
				sound: {
					active: true,
					synth: "explosion",
					clip: "none",
					volume: -6,
					rate: 1
				}
			},
			// Bullet-fire sound, data-driven (was BulletManager's playBullet).
			bulletFire: {
				sound: {
					active: true,
					synth: "bullet",
					clip: "none",
					volume: -6,
					rate: 1
				}
			},
			scoreIncrement: {
				floatingScore: {
					active: false,
					duration: 0.8,
					fontSize: 20
				}
			},
			scoreArrive: {
				particles: {
					active: false,
					particleSystem: "scoreArrive"
				}
			},
			shipThrust: {
				particles: {
					active: false,
					particleSystem: "shipThrust"
				}
			},
			music: {
				volume: -12,
				track: "heartbeat"
			},
			sillySounds: {
				pewpewpew: false
			},
			sillyColors: {
				active: false,
				shipHue: 0,
				asteroidHue: 0,
				particleHue: 0,
				backgroundHue: 0
			},
			eyeBallsOnAsteroids: {
				eyeBalls: {
					active: false
				}
			},
			particleTester: {
				particles: {
					active: true,
					particleSystem: "particleTest"
				}
			}
		};
	}

	createDefaultParticleSystems() {
		const base = super.createDefaultParticleSystems();
		return {
			...base,
			bulletHit: {
				vectorParticle: {
					shape: "line",
					count: 15,
					size: 10,
					pattern: "radial",
					rotation: "random",
					rotationSpeed: 5,
					particleLife: 2,
					initialVelocityRandom: false,
					initialVelocity: 30,
					fade: true,
					followObject: false,
					inheritVelocity: false
				}
			},
			scoreArrive: {
				vectorParticle: {
					shape: "dot",
					count: 8,
					size: 5,
					pattern: "radial",
					rotation: "random",
					rotationSpeed: 3,
					particleLife: 4,
					initialVelocityRandom: true,
					initialVelocity: 50,
					fade: true,
					followObject: false,
					inheritVelocity: false,
					gravity: true
				}
			},
			shipThrust: {
				vectorParticle: {
					shape: "dot",
					count: 2,
					size: 3,
					pattern: "random",
					rotation: "random",
					rotationSpeed: 2,
					particleLife: 4,
					initialVelocityRandom: false,
					initialVelocity: 0,
					fade: true,
					followObject: false,
					inheritVelocity: false,
					gravity: false,
					fill: true,
					hue: 0
				}
			}
		};
	}
}
