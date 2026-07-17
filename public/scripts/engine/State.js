/* 
 * State Class 
 * 
 * The state class allows us to group different rendering and update functions of relevant gameobjects
 * into a single object to be loaded at the top-level of the application. These can be thought of as
 * "scenes" in other engines, though a bit more integration is needed in the entry point of the application.
 * 
 * A State should essentially encapsulate a discrete "form" of your game. For example, a simple game might
 * have a loading state, game state, pause state... the boundaries of this definition are fairly porous.
 * 
 * States can be nested - meaning you can embed a state engine within another. Adding a switch in the 
 * update and render functions with the appropriate state checking accomplishes this.
 * 
 * The top-level state should be maintained in the Game Session. 
 * 
*/

export default class State {

    constructor(gameSession, name){

        this.__name = name;

        //link to gameSession
        this.__gameSession = gameSession;
        this.__p5 = this.__gameSession.p5;
        this.__gameSession.addStateToGame(this);

    }

    //call before first update to perform first time setup
    setup(){
        console.log("Setting up " + this.name + " state.");
    }

    //make updates to any relevant model/data
    update(){

    }

    //make updates to display
    render(){

    }

    //call after leaving main context for the engine. Manage memory and state appropriately
    cleanup(){
        console.log("Cleaning up " + this.name) + " state.";
    }

    //These are possible input methods. They should be implemented (if needed) in your state class.
    //these all are linked in index.js.
    mousePressed(){
        console.log("mouse pressed");
    }
    
/*
    keyPressed(){
        console.log("input detected");
    }
    
    keyReleased(){
        console.log("input detected");
    }
    
    keyTyped(){
        console.log("input detected");
    }
    
    keyIsDown(){
        console.log("input detected");
    }
    
    mouseMoved(){
        console.log("input detected");
    }
    
    mouseDragged(){
        console.log("input detected");
    }
    
    mousePressed(){
        console.log("input detected");
    }
    
    mouseReleased(){
        console.log("input detected");
    }
    
    mouseClicked(){
        console.log("input detected");
    }
    
    doubleClicked(){
        console.log("input detected");
    }
    
    mouseWheel(){
        console.log("input detected");
    }
    
    requestPointerLock(){
        console.log("input detected");
    }
    
    exitPointerLock(){
        console.log("input detected");
    }

    */

    get name(){
        return this.__name;
    }

    set name(name){
        this.__name = name;
    }

    get gameSession(){
        return this.__gameSession;
    }

    set gameSession(gameSession){
        this.__gameSession = gameSession;
    }

    
    get p5(){
        return this.__p5;
    }

    set p5(p5){
        this.__p5 = p5;
    }
}
