import ColorFlashEffector from "./ColorFlashEffector.js";

export default class FlashColor extends ColorFlashEffector{

    constructor(duration, fill){
        super(duration);
        this.__fill = fill;
    }

    update(){
        if(!this.finished()){
            this.playColorFlash();
        }
    }

    playColorFlash(){
        this.p5.background(this.__fill);
    }

}