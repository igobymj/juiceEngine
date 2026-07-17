/*
	SoundClass class

	SoundClass is the container class for a sound effect and its variations (SoundObjects), as well as its volume control, panning, and output
	It also provides methods for playing the sound, changing the active SoundObject, and adding effects

	By Jonathan Leland
	Last Updated 5/2/22
*/

export default class SoundClass{
	/* Constructor */
	//Creates a main output node and an internal array of SoundObjects
	constructor(gameSession){
		this.__gameSession = gameSession;
		//Main output node
		this.__output = new Tone.PanVol();

		//TODO: Compare switching sound objects with solo/muting

		//Internal array of SoundObjects to choose from
		this.__soundObjects = new Array();

		//Index of active SoundObject, defaulted to 0
		this.__activeIndex = 0;

		//TODO: Flag for checking if inactive SoundObjects should be disconnected?
		// this.__isSwitching = false;

		//TODO: internal effects chain?
	}

	//Method for changing the active SoundObject
	changeSoundObject(newIndex){
		if (newIndex >= 0 && newIndex < this.__soundObjects.length){
			this.__activeIndex = newIndex;
		}
		else{
			console.warn("invalid index for soundObjects array, activeIndex was not changed");
		}
	}

	//TODO: Separate methods for play/stop and playOneShot??
	//		(One shot sound classes could just force playOneShot...)

	// "Virtual" Play method
	play(){
		console.warn("play method from base SoundClass was called. This should be overloaded in the derived class.");
	}

	// "Virtual" Stop method
	stop(){
		console.warn("stop method from base SoundClass was called. This should be overloaded in the derived class.");
	}

	connect(node){
		this.__output.connect(node);
	}

	dispose(){
		console.warn("dispose method from base SoundClass was called, this should be overloaded in the derived class.");
		//TODO: dispose of each SoundObject, then dispose this.__output
	}

	//TODO: Update method for disconnecting inactive SoundObjects?
	// update(){
	// 	if (this.__isSwitching){
	// 		let switchCount = 0;
	// 		for (let i = 0; i < this.__soundObjects.length; ++i){
	// 			if (this.__soundObjects[i] !== this.__activeIndex && this.__soundObjects[i].connected){
	// 				console.log("Attempting to disconnect sound object " + i);
	// 				this.__soundObjects[i].tryDisconnect();
	// 				++switchCount;
	// 			}
	// 		}
	// 		if (switchCount == 0){
	// 			this.__isSwitching = false;
	// 		}
	// 	}
	// }
}