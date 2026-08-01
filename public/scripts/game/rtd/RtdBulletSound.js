/*
 * RtdBulletSound — the fire sound for RTD projectiles.
 *
 * Pools BulletVoice (a sawtooth with a downward frequency sweep) so rapid fire
 * doesn't cut itself off. A SoundClass so SoundManager.registerSound() routes it
 * through the sfx mix like any other sound.
 */

import SoundClass from "../../engine/sounds/SoundClass.js";
import BulletVoice from "./sounds/BulletVoice.js";

export default class RtdBulletSound extends SoundClass {
  constructor(gameSession, poolSize = 4) {
    super(gameSession);
    this.__poolSize = poolSize;
    this.__poolIndex = 0;
    this.__pool = [];
    for (let i = 0; i < poolSize; i++) {
      const voice = new BulletVoice(gameSession);
      voice.connect(this.__output);
      this.__pool.push(voice);
    }
    this.__soundObjects.push(this.__pool);
  }

  play() {
    this.__pool[this.__poolIndex].play();
    this.__poolIndex = (this.__poolIndex + 1) % this.__poolSize;
  }
}
