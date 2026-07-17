
/*

    ColorFlashEffector

    effector class for creating a screen color flash. 
    Takes the following juice parameters:
    - active (boolean)
    - color (string, will be used to pass to p5), "random" is valid value
    - duration (float, in seconds)
    - frequency (float, in Hz)
    - form (string, defines how color cycles)

    last modified by MJ 6/23/22

*/


export default class ColorFlashEffector {

    constructor(gameSession, eventName) {

        this.__gameSession = gameSession;

        //for returning type to semaphore counter
        this.__effectName = "colorFlash";

        //construct this effector object using the juiceSettings object        
        this.__active = this.gameSession.juiceSettings.container[eventName].colorFlash.active;
        this.__alpha = this.gameSession.juiceSettings.container[eventName].colorFlash.alpha;
        this.__flashColor = this.gameSession.juiceSettings.container[eventName].colorFlash.color;
        this.__duration = this.gameSession.juiceSettings.container[eventName].colorFlash.duration; 
        this.__stackable = this.gameSession.juiceSettings.container[eventName].colorFlash.stackable;
        this.__stackWindow = this.gameSession.juiceSettings.container[eventName].colorFlash.stackWindow;

        //field stores whether to retire the object
        this.__completed = false;

        //precalculate alpha drop per millisecond, assuming linear drop. Guard against divide-by zero.
        if( this.__duration <= 0 ) { this.__duration = 0.1; }
        this.__alphaDrop = this.__alpha / this.__duration;

        //record time it's created
        this.__startTime = this.gameSession.timeManager.time;

    }

    finished(){
        
        //ensure that it fires at least once. Flashcolor being zero is a semaphore used by 
        //index.js 
        if( this.completed ) {
            this.gameSession.flashColor = 0;
            return true;
        }
    }

    update() {

        // determine color. This has to be redone frame by frame to account for fade-out
        let tmpColor;
        tmpColor = this.p5.color(this.flashColor);
        tmpColor.setAlpha(this.alpha);
        this.gameSession.flashColor = tmpColor;

        
        // fade out if there's a "duration"
        // TODO: add exponential fade
        let alphaIncrement = this.alphaDrop / this.gameSession.timeManager.deltaTime;
        this.alpha -= alphaIncrement;

        
        // after some set amount of time (defined in juice settings) allow the effect to fire again and stack
        if( this.gameSession.timeManager.time - this.initiationTime >= this.stackWindow ) {
            this.stackable = true;
        }

        // uses alpha value on fade-out to determine when it's complete
        if( this.alpha <= 0 ) {
            this.completed = true;
        }

    }

    //empty render function intentionally
    render() {
        
    }


    get p5() {
        return this.__gameSession.__p5;
    }

    get gameSession() {
        return this.__gameSession;
    }

    get active() {
        return this.__active;
    }

    get flashColor() {
        return this.p5.color(this.__flashColor);
    }

    set flashColor( flashColor ) {
        this.__flashColor = flashColor;
    }

    get alpha() {
        return this.__alpha;
    }

    set alpha( alpha ) {
        this.__alpha = alpha;
    }

    get duration() {
        return this.__duration;
    }

    get completed() {
        return this.__completed;
    }

    set completed( completed ) {
        this.__completed = completed;
    }

    get stackable() {
        return this.__stackable;
    }

    set stackable( stackable ) {
        this.__stackable = stackable;
    }

    get stackWindow() {
        return this.__stackWindow;
    }

    set fired( fired ) {
        this.__fired = fired;
    }

    get startTime() {
        return this.__startTime;
    }

    get effectName() {
        return this.__effectName;
    }

    get alphaDrop() {
        return this.__alphaDrop;
    }


}