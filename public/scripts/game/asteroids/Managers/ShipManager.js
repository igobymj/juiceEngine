
/* shipmanager.js
Simple container to allow ship object to be accessed 
via gameSession. 
Inherits from Manager
nothing inherits from this class

Created by MJ 6/15/22
*/


import Manager from "../../../engine/Managers/Manager.js";
import Ship from "../Ship.js";


export default class ShipManager extends Manager{
	
	constructor(gameSession) {

		// (singleton guard removed — engine is de-singletoned; one per session)
		super(gameSession);

		this.__ship = {};

		if( this.gameSession.verbose === true ) {
			console.log("ship manager created successfully");
		}

	}

	createShip() {
		this.ship = new Ship(this.gameSession);
	}

	get ship() {
		return this.__ship
	}

	set ship( ship ) {
		this.__ship = ship;
	}

}