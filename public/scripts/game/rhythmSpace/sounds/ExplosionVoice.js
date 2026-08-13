/*
 * ExplosionVoice — RTD's asteroid explosion sound (pink noise through a bandpass
 * filter with a downward frequency sweep). Adapted from the asteroids project's
 * DefaultExplosion so RTD owns its own copy.
 */

import SoundObject from "../../../engine/sounds/SoundObject.js";

export default class ExplosionVoice extends SoundObject {
  constructor(gameSession) {
    super(gameSession);

    this.__output.set({ volume: 0 });

    this.__filterFrequency = 60;
    this.__envDuration = 1;

    this.__env.set({
      attack: 0,
      release: this.__envDuration,
      releaseCurve: "linear",
    });
    this.__filter = new Tone.BiquadFilter({
      Q: 1.5,
      frequency: this.__filterFrequency,
      type: "bandpass",
    }).connect(this.__env);
    this.__freq = new Tone.FrequencyEnvelope({
      attack: 0,
      baseFrequency: this.__filterFrequency,
      octaves: 2.5,
      release: this.__envDuration,
      releaseCurve: "exponential",
      exponent: 0.01,
    }).connect(this.__filter.frequency);
    this.__noise = new Tone.Noise("pink").connect(this.__filter).start();
  }

  play() {
    const timeScale = this.__gameSession.timeManager.timeScale;

    const freq = this.__filterFrequency * timeScale;
    this.__filter.set({ frequency: freq });
    this.__freq.set({ baseFrequency: freq });

    let dur = timeScale > 0 ? this.__envDuration / timeScale : 0;
    dur = Math.max(Math.min(dur, 1.5), 0.01);
    this.__env.release = dur;
    this.__freq.release = dur;

    this.__freq.triggerAttackRelease(0);
    this.__env.triggerAttackRelease(0);
  }
}
