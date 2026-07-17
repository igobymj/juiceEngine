/*
  TimeManager class
  
  Time Management in Game

  - Time, deltaTime is for physics, movement, effects; the time scale can change the speed of time
  - UnscaledTime, unscaledDeltaTime is for the wireframe; its speed can not be changed
  - if we need fixed update we can use fixed time, if not, we don't
    
  By Weiqiang Chen
  Last Updated 5/07/22 by Eddie Melcer
*/

import Manager from "./Manager.js";
import { DEFAULT_FRAME_RATE, DEFAULT_FIXED_RATE } from "../EngineConstants.js";


export default class TimeManager extends Manager {

    constructor(gameSession) {
        if (TimeManager.__instance) {
            return TimeManager.__instance;
        }

		super(gameSession);
		
        TimeManager.__instance = this;

        this.__instance = {}; //TimeManager

        this.__timeScale = 1;
        this.__frameRate = DEFAULT_FRAME_RATE;
        this.__fixedRate = DEFAULT_FIXED_RATE;

        // Scaled Time - deltaTime should be used for all movement.
        // deltaTime is in milliseconds per frame
        this.__time = 0;
        this.__timeIncrement = 1000 / this.__frameRate;
        this.__deltaTime = this.__timeIncrement * this.__timeScale;

        // Unscaled Time
        this.__unscaledTime = 0;
        this.__unscaledTimeIncrement = 1000 / this.__frameRate;
        this.__unscaledDeltaTime = this.__unscaledTimeIncrement;

        // Fixed Time
        this.__fixedTime = 0;
        this.__fixedTimeIncrement = 1000 / this.__fixedRate;
        this.__fixedDeltaTime = this.__fixedTimeIncrement;

        // Real Time
        this.__realTimeSinceStartup = 0;
        this.__startTime = performance.now();

        // Frame Count
        this.__frameCount = 0;

        if( this.gameSession.verbose === true ) {
            console.log("time Manager created successfully");
        }
    }
    
	update() {
        this.__time += this.__deltaTime;
		this.__unscaledTime += this.__unscaledDeltaTime;
		this.__fixedTime += this.__fixedDeltaTime;
        this.__frameCount++;
    }

    // takes a float from 0.0 to 1.0, applies that to slow time
    // duration is how long the effect lasts
    setScale( timeScaler ) {
        this.timeScale = timeScaler;
    }

    start() {
        this.__startTime = performance.now();
    }

    get instance() {
        return this.__instance;
    }

    set instance(instance) {
        this.__instance = instance;
    }

    get time() {
        return this.__time;
    }

    get deltaTime() {
        return this.__deltaTime;
    }

    get unscaledTime() {
        return this.__unscaledTime;
    }

    get unscaledDeltaTime() {
        return this.__unscaledDeltaTime;
    }

    get fixedTime() {
        return this.__fixedTime;
    }

    get realTimeSinceStartup() {
		this.__realTimeSinceStartup = performance.now() - this.__startTime;
		return this.__realTimeSinceStartup;
    }

    get frameCount() {
        return this.__frameCount;
    }

    get timeScale() {
        return this.__timeScale;
    }

    set timeScale(newTimeScale) {
        if (newTimeScale < 0) {
            this.__timeScale = 0;
        }
        this.__timeScale = newTimeScale;
        // Scaled Time 
        this.__deltaTime = this.__timeIncrement * this.__timeScale;
    }

    get frameRate() {
        return this.__frameRate;
    }

    set frameRate(newFrameRate) {
        this.__frameRate = newFrameRate;
        // Scaled Time 
        this.__timeIncrement = 1000 / this.__frameRate;
        this.__deltaTime = this.__timeIncrement * this.__timeScale;
        // Unscaled Time
        this.__unscaledTimeIncrement = 1000 / this.__frameRate;
        this.__unscaledDeltaTime = this.__unscaledTimeIncrement;
    }

    get fixedRate() {
        return this.__fixedRate;
    }

    set fixedRate(newFixedRate) {
        this.__fixedRate = newFixedRate;
        // Fixed Time
        this.__fixedTimeIncrement = 1000 / this.__fixedRate;
        this.__fixedDeltaTime = this.__fixedTimeIncrement;
    }

}