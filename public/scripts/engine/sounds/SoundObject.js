/*
	SoundObject class

	SoundObject is the base class for a sound effect, with an output and amplitude envelope
	It provides methods for playing the sound, and connecting/disconnecting

	By Jonathan Leland
	Last Updated 5/2/22
*/

export default class SoundObject{
	/* Constructor */
	//Creates a main output node and amplitude envelope
	constructor(gameSession){
		this.__gameSession = gameSession;
		//Main output node
		this.__output = new Tone.PanVol();
		this.__env = new Tone.AmplitudeEnvelope().connect(this.__output);
	}

	// Try disconnect method for disconnecting when amplitude envelope is zero
	// tryDisconnect(){
	// 	if (this.__env.value == 0){
	// 		this.__output.disconnect();

	// 		console.log("Sound object disconnected");
	// 	}
	// }

	// "Virtual" Play method
	play(){
		console.warn("play method from base SoundObject was called. This should be overloaded in the derived class.");
	}

	//"Virtual" Stop method
	stop(){
		console.warn("stop method from base SoundObject was called. This should be overloaded in the derived class.");
	}

	connect(node){
		//TODO: Limit number of connections to 1 ?
		this.__output.connect(node);
	}

	dispose(){
		console.warn("dispose method from base SoundObject was called, this should be overloaded in the derived class.");
	}
}