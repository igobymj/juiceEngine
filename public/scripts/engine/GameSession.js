
import GameLoop from "./GameLoop.js"
import InputManager from "./Managers/InputManager.js";
import SoundManager from "./Managers/SoundManager.js";
import TimeManager from "./Managers/TimeManager.js";
import SpriteManager from "./Managers/SpriteManager.js";
import JuiceEventManager from "./Managers/JuiceEventManager.js";
import JuiceSettings from "./JuiceSettings.js";
import ParticleSystemDefinitions from "./Effects/ParticleEffects/ParticleSystemDefinitions.js";

export default class GameSession {

	constructor() {
		if (GameSession.__instance) {
			return GameSession.__instance;
		}
		GameSession.__instance = this;
		this.__instance = this;
		//Browser Information
		this.__canvasHeight = 0;
		this.__canvasWidth = 0;

		//Instance Variables

		this.__p5 = {}; //P5 instance
		this.__canvas = {}; //P5 Canvas

		//Important Globals
		this.__backgroundColor = 0;
		this.__flashColor = 0;

		//Debug verbose
		this.__verbose = true;

		//Game Loop object
		this.__gameLoop = this.createGameLoop();

		//InputManager
		this.__inputManager = new InputManager(this);

		//SoundManager
		this.__soundManager = new SoundManager(this);

		//TimeManager
		this.__timeManager = new TimeManager(this);

		//Sprite Manager
		this.__spriteManager = new SpriteManager(this);

		//manages all juice effects through a single central object
		this.__juiceEventManager = new JuiceEventManager(this);

		//Object to store all current juice settings
		this.__juiceSettings = this.createJuiceSettings();

		//GUI Manager
		this.__juiceGuiManager = this.createJuiceGuiManager();

		// likely to be deprecated:

		//Object stores particle system definitions
		this.__particleSystemDefinitions = new ParticleSystemDefinitions();

		//All states available to game
		this.__states = [];

		//Current state
		this.__currentState = {};

		if (this.verbose === true) {
			console.log("Session Created Successfully.");
		}
	}

	// Override in subclass to provide a game-specific loop
	createGameLoop() {
		return new GameLoop(this);
	}

	// Override in subclass to provide game-specific juice settings
	createJuiceSettings() {
		return new JuiceSettings();
	}

	// Override in subclass to provide a game-specific GUI manager
	createJuiceGuiManager() {
		return null;
	}

	// Register a named manager on this session (used by subclasses to add game-specific managers)
	registerManager(name, manager) {
		const privateName = `__${name}`;
		this[privateName] = manager;

		// Define getter/setter if not already present
		if (!Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), name)) {
			Object.defineProperty(this, name, {
				get() { return this[privateName]; },
				set(value) { this[privateName] = value; },
				configurable: true,
				enumerable: true
			});
		}
	}

	//used to add states to game on game load or dynamically
	addStateToGame(state) {
		this.states.push(state);
	}

	//simplifies state setup. calls setup and then loads the state into currentState.
	setCurrentState(state) {
		//TODO: Make this safe to add non-pre-existing states
		this.currentState = state;
		this.currentState.setup();
	}

	setCurrentStateByName(stateName) {
		let state;
		for (let i = 0; i < this.states.length; i++) {
			if (this.states[i].name == stateName) {
				state = this.states[i];
			}
		}

		if (state) {
			this.setCurrentState(state);
		} else {
			console.log(`ERROR: ${stateName} not loaded as current state in session.`);
		}
	}

	get states() {
		return this.__states;
	}

	set states(states) {
		this.__states = states;
	}

	get currentState() {
		return this.__currentState;
	}

	set currentState(currentState) {
		this.__currentState = currentState;
	}

	get instance() {
		return this.__instance;
	}

	set instance(instance) {
		this.__instance = instance;
	}

	get p5() {
		return this.__p5;
	}

	set p5(p5) {
		this.__p5 = p5;
	}

	get canvas() {
		return this.__canvas;
	}
	set canvas(canvas) {
		this.__canvas = canvas;
	}

	get backgroundColor() {
		return this.__backgroundColor;
	}

	set backgroundColor(backgroundColor) {
		this.__backgroundColor = backgroundColor;
	}

	get flashColor() {
		return this.__flashColor;
	}

	set flashColor(flashColor) {
		this.__flashColor = flashColor;
	}

	// gameUpdate getter/setter kept for backwards compatibility
	get gameUpdate() {
		return this.__gameLoop;
	}

	set gameUpdate(gameUpdate) {
		this.__gameLoop = gameUpdate;
	}

	get gameLoop() {
		return this.__gameLoop;
	}

	set gameLoop(gameLoop) {
		this.__gameLoop = gameLoop;
	}

	set inputManager(inputManager) {
		this.__inputManager = inputManager;
	}

	get inputManager() {
		return this.__inputManager;
	}

	get soundManager() {
		return this.__soundManager;
	}

	set soundManager(soundManager) {
		this.__soundManager = soundManager;
	}

	get timeManager() {
		return this.__timeManager;
	}

	set timeManager(timeManager) {
		this.__timeManager = timeManager;
	}

	get screenShakeManager() {
		return this.__screenShakeManager;
	}

	set screenShakeManager(screenShakeManager) {
		this.__screenShakeManager = screenShakeManager;
	}

	get canvasHeight() {
		return this.__canvasHeight;
	}

	set canvasHeight(canvasHeight) {
		this.__canvasHeight = canvasHeight;
	}

	get canvasWidth() {
		return this.__canvasWidth;
	}

	set canvasWidth(canvasWidth) {
		this.__canvasWidth = canvasWidth;
	}

	get spriteManager() {
		return this.__spriteManager;
	}

	set spriteManager(spriteManager) {
		this.__spriteManager = spriteManager;
	}

	get juiceSettings() {
		return this.__juiceSettings;
	}

	set juiceSettings(juiceSettings) {
		this.__juiceSettings = juiceSettings;
	}

	get particleSystemDefinitions() {
		return this.__particleSystemDefinitions;
	}

	get juiceEventManager() {
		return this.__juiceEventManager;
	}

	set juiceEventManager(juiceEventManager) {
		this.__juiceEventManager = juiceEventManager;
	}

	get juiceGuiManager() {
		return this.__juiceGuiManager;
	}

	set juiceGuiManager(manager) {
		this.__juiceGuiManager = manager;
	}

	get verbose() {
		return this.__verbose;
	}

	// debug
	PrintSomething(something) {
		console.log(something);
	}


}
