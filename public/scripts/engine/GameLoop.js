import Manager from "./Managers/Manager.js";

/** GameLoop
 *
 *  Base game loop class. Maintains ordered lists of updatable/renderable systems.
 *  Subclass and override to add game-specific systems.
 *
 */

export default class GameLoop extends Manager {

    constructor(gameSession){

        //singleton
        if(GameLoop.__instance){
            return GameLoop.__instance;
        }

        super(gameSession);

        GameLoop.__instance = this;
        this.__instance = this;

        this.__delayFrames = 0;

        // Ordered lists of systems to update/render
        this.__updateSystems = [];
        this.__renderSystems = [];
    }

    // Register a system for the update loop
    // system must have an update() method
    // priority determines order (lower = earlier)
    addUpdateSystem(name, system, priority = 100) {
        this.__updateSystems.push({ name, system, priority });
        this.__updateSystems.sort((a, b) => a.priority - b.priority);
    }

    // Register a system for the render loop
    // system must have a render() method
    // priority determines order (lower = earlier)
    addRenderSystem(name, system, priority = 100) {
        this.__renderSystems.push({ name, system, priority });
        this.__renderSystems.sort((a, b) => a.priority - b.priority);
    }

    update(){

        if(this.delayFrames <= 0) {
            for (const entry of this.__updateSystems) {
                entry.system.update();
            }
        }
        else {
            this.delayFrames = this.delayFrames - 1;
        }

    }

    render(){
        for (const entry of this.__renderSystems) {
            entry.system.render();
        }
    }

    keyIsDown(){
    }

    keyPressed() {
    }


    get instance(){
        return this.__instance;
    }

    set instance(instance){
        this.__instance = instance;
    }


    get delayFrames() {
        return this.__delayFrames;
    }

    set delayFrames(delayFrames) {
        this.__delayFrames = delayFrames;
    }



}
