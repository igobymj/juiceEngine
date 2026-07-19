/*
 * InputManager — base class
 *
 * Central dispatch for mouse and key input. Components (managers, tools)
 * register as handlers; the InputManager forwards events from p5 to all
 * registered handlers in registration order.
 *
 * Mouse handlers are objects with any subset of {mousePressed, mouseDragged,
 * mouseReleased}. Key handlers are functions (key) => void invoked on
 * one-shot keypresses (called from p5's keyPressed via `keyInput`).
 *
 * Override `update()` in a subclass to poll held-key state via
 * this.gameSession.p5.keyIsDown(...).
 */

import Manager from "./Manager.js";

export default class InputManager extends Manager {

    constructor(gameSession) {
        // (singleton guard removed — multiple instances allowed)

        super(gameSession);

        InputManager.__instance = this;

        this.__inputObject = {};
        this.__mouseHandlers = [];
        this.__keyHandlers = [];

        if (this.gameSession.verbose === true) {
            console.log("input manager created successfully");
        }
    }

    update() {
        // Poll held keys into inputObject every frame.
        const p = this.gameSession.p5;

        const RIGHT = (p.keyIsDown(68) || p.keyIsDown(39)) ? 1 : 0;
        const LEFT = (p.keyIsDown(65) || p.keyIsDown(37)) ? 1 : 0;
        const DOWN = (p.keyIsDown(83) || p.keyIsDown(40)) ? 1 : 0;
        const UP = (p.keyIsDown(87) || p.keyIsDown(38)) ? 1 : 0;

        // create positive or negative number depending on keys held down
        this.__inputObject.movement = {
            x: RIGHT - LEFT,
            y: DOWN - UP,
        };
    }

    // Registration

    addMouseHandler(handler) {
        this.__mouseHandlers.push(handler);
    }

    addKeyHandler(handler) {
        this.__keyHandlers.push(handler);
    }

    // Dispatch — call from p5's mouse/key callbacks.

    mousePressed(x, y) {
        for (const h of this.__mouseHandlers) {
            if (h.mousePressed) h.mousePressed(x, y);
        }
    }

    mouseDragged(x, y) {
        for (const h of this.__mouseHandlers) {
            if (h.mouseDragged) h.mouseDragged(x, y);
        }
    }

    mouseReleased() {
        for (const h of this.__mouseHandlers) {
            if (h.mouseReleased) h.mouseReleased();
        }
    }

    // p5's one-shot key callback routes here.
    keyInput(key) {
        for (const h of this.__keyHandlers) {
            h(key);
        }
    }

    get inputObject() {
        return this.__inputObject;
    }

    set inputObject(input) {
        this.__inputObject = input;
    }

    get instance() {
        return this.__instance;
    }

    set instance(instance) {
        this.__instance = instance;
    }
}
