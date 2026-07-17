/*

ScreenShakeEffector

    Set up as a generic screen shaker. Takes name of event, and looks up appropriate
    shake parameters from juiceSettings. 

    Supports sinusoidal, random and Perlin noise as shake functions.

    Formula and parameters are set up in constructor. 

    last modified by MJ 9/25/24

*/

export default class ScreenShakeEffector {

    constructor(gameSession, eventName, triggerObject) {
        this.__gameSession = gameSession;

        //construct this effector object using the juiceSettings object        
        this.__active = this.gameSession.juiceSettings.container[eventName].shake.active;
        this.__xAxis = this.gameSession.juiceSettings.container[eventName].shake.xAxis; // boolean
        this.__yAxis = this.gameSession.juiceSettings.container[eventName].shake.yAxis; // boolean
        this.__frequency = this.gameSession.juiceSettings.container[eventName].shake.frequency // cycles/second
        this.__intensity = this.gameSession.juiceSettings.container[eventName].shake.amplitude; // float 0.0 - 1.0
        this.__duration = this.gameSession.juiceSettings.container[eventName].shake.duration * 1000; //convert to milliseconds
        this.__form = this.gameSession.juiceSettings.container[eventName].shake.form; // string, e.g. "sine" or "noise"
        this.__fade = this.gameSession.juiceSettings.container[eventName].shake.fade; // boolean

        this.__intensity = this.__intensity * 12; // scales 0.0-1.0 amplitude to pixel offset

        // this determines the axis of shake effect. 
        if( this.gameSession.juiceSettings.container[eventName].shake.inheritVelocity === true) {
            this.__shakeVector = this.gameSession.p5.createVector(triggerObject.velocity.x, triggerObject.velocity.y);
        }
        else {
            //create a random vector
            let shakeX = 0;
            let shakeY = 0;
            if( this.xAxis === true ) {
                shakeX = Math.random() - 0.5;
            }
            if( this.yAxis === true ) {
                shakeY = Math.random() - 0.5;
            }
             this.__shakeVector = this.gameSession.p5.createVector(shakeX,shakeY);         
       }
        this.shakeVector.normalize(); 


        this.__startTime = this.gameSession.timeManager.unscaledTime;
        this.__currentIntensity = 1;
        
        this.__msPerTick = 1000 / this.frequency;
        this.__totalTicks = this.duration / this.msPerTick;
        this.__ticks = 0; // used to produce a linear sequence for noise function
        this.__lastTickTime = 0; // time flag for prior tick to calculate next

    }

    finished(){

        if( this.ticks > this.__totalTicks ) {
            return "screenShake";
        }
        else {
            return false;
        }
    }

    update(){

            // screen shake can either just end, or fade out (fading out amplitude). Fading usually looks better.
            // `fade` is a string ('linear' | 'exponential') or falsy; truthy enables fading.
            if( this.fade ) {
                this.shakeFader();
            }

            let tickExpired = false;

            // compute ticks here, based on defined frequency (msPerTick is based on frequency)
            if( this.gameSession.timeManager.time > this.lastTickTime + this.msPerTick ) {
                this.ticks += 1;
                this.__lastTickTime = this.gameSession.timeManager.time;
                tickExpired = true;
            }

            // noise and random functions fire only on expiration of frequency. Because sin() is continuous,
            // it fires every frame
            if( tickExpired === true || this.form === "sine") {
                let offset;
                offset = this.computeShake(); // returns a float, 

                offset = offset * this.currentIntensity; // apply fader (1.0 to 0.0 multiplier)

                // unfortunately static function calls don't work in this app...
                let tempVec = this.gameSession.p5.createVector(this.shakeVector.x, this.shakeVector.y);
                tempVec.setMag(offset);
                this.gameSession.p5.translate(tempVec.x, tempVec.y);
            }

    }

    //empty render function intentionally
    render() {
        
    }


    computeShake() {
    
        switch(this.form) {  
            case "sine":
                return this.sineShake();
                break;
            case "noise":
                return this.noiseShake();
                break;
            case "simple":
                return this.simpleShake();
                break;
            default:
                return this.sineShake();
        }

    }

    shakeFader() {
        
        // linear fade reduces amplitude in linear fashion over time
        if( this.fade === "linear" ) {
            this.currentIntensity = 1 - (this.ticks / this.__totalTicks); // produces a value from 1.0 fading to 0.0            
        }

        // exponential currently uses power of 4 for the formula (Math.pow(timeElapsed, 4))
        if( this.fade === "exponential" ) { 
            this.currentIntensity = 1 - Math.pow(this.ticks / this.__totalTicks, 2);
        }

    }

    // uses a sin function to generate magnitudes to be applied to the shake vector
    sineShake() {

        // identify current fraction of a single wave cycle
        let currentFraction = (this.gameSession.timeManager.time - this.lastTickTime) / this.msPerTick;

        // turn that fraction into radians
        let angle = 2 * Math.PI * currentFraction;

        // get sin() of radian
        let offsetValue;
        offsetValue = this.gameSession.p5.sin(angle) * this.intensity;

        return offsetValue;
    }

    noiseShake() {
        // use p5's built in function to return Perlin noise

        let offsetValue = (this.gameSession.p5.noise(this.ticks) * this.intensity); 

        return offsetValue;
 
    }   

    simpleShake() {

        if( Math.random() > 0.5 ) {
            return this.intensity;
        }
        else {
            return this.intensity * -1;
        }
    }

    get gameSession(){
        return this.__gameSession;
    }

    get active() {
        return this.__active;
    }

    get shakeVector() {
        return this.__shakeVector;
    }

    get xRandomizer() {
        return this.__xRandomizer;
    }

    get yRandomizer() {
        return this.__yRandomizer;
    }

    get intensity() {
        return this.__intensity;
    }

    get frequency() {
        return this.__frequency;
    }

    get intensityMultiplier() {
        return this.__intensityMultiplier;
    }

    get initialDirection() {
        return this.__initialDirection;
    }

    get duration(){
        return this.__duration;
    }

    get form() {
        return this.__form;
    }

    get fade() {
        return this.__fade;
    }

    get startTime() {
        return this.__startTime;
    }

    get currentIntensity() {
        return this.__currentIntensity;
    }

    set currentIntensity(currentIntensity){
        this.__currentIntensity = currentIntensity;
    }

    get msPerTick() {
        return this.__msPerTick;
    }

    get ticks() {
        return this.__ticks;
    }

    set ticks(ticks) {
        this.__ticks = ticks;
    }

    get lastTickTime() {
        return this.__lastTickTime;
    }

    set lastTickTime(lastTickTime) {
        this.__lastTickTime = lastTickTime;
    }

    get xAxis() {
        return this.__xAxis;
    }

    get yAxis() {
        return this.__yAxis;
    }

}