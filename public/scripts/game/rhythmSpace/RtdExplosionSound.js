/*
 * RtdExplosionSound — the explosion sound for RTD asteroid hits.
 *
 * Pools ExplosionVoice so overlapping hits don't cut each other off. A SoundClass
 * so SoundManager.registerSound() routes it through the sfx mix.
 */

import SoundClass from "../../engine/sounds/SoundClass.js";
import ExplosionVoice from "./sounds/ExplosionVoice.js";

export default class RtdExplosionSound extends SoundClass {
  constructor(gameSession, poolSize = 4) {
    super(gameSession);
    this.__poolSize = poolSize;
    this.__poolIndex = 0;
    this.__pool = [];
    for (let i = 0; i < poolSize; i++) {
      const voice = new ExplosionVoice(gameSession);
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
