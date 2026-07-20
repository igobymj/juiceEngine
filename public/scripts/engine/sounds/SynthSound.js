/*
 * SynthSound — a procedural one-shot clip (no audio file needed).
 *
 * Implements the clip contract the SoundEffector uses: connect(node) to route
 * into the mixer, and play({ volume, rate }) to trigger. `rate` shifts pitch,
 * `volume` is dB on the clip's own output. Handy for prototyping event sounds
 * before you have real assets; SampleSoundObject is the file-backed equivalent.
 */
export default class SynthSound {
  constructor(gameSession, options = {}) {
    this.__gameSession = gameSession;
    this.__output = new Tone.Volume(options.volume ?? 0);
    const Synth = options.synth || Tone.MembraneSynth;
    this.__synth = new Synth().connect(this.__output);
    this.__note = options.note ?? 'C2';
    this.__duration = options.duration ?? '16n';
  }

  connect(node) { this.__output.connect(node); }

  play(opts = {}) {
    if (opts.volume != null) this.__output.volume.value = opts.volume;
    const freq = Tone.Frequency(this.__note).toFrequency() * (opts.rate ?? 1);
    try { this.__synth.triggerAttackRelease(freq, this.__duration); } catch (e) { /* context not started yet */ }
  }

  stop() {}
  dispose() { this.__synth.dispose(); this.__output.dispose(); }
}
