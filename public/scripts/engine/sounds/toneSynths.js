/*
 * toneSynths — a library of procedural Tone.js synthesizer sounds.
 *
 * Each entry in TONE_SYNTHS is a one-shot voice preset: a Tone synth class, its
 * constructor options, and the default note/duration to trigger. ToneSynthSound
 * wraps a preset so it satisfies the engine's sound contract used by
 * SoundManager / SoundEffector:
 *   connect(node)          — route into a mixer channel
 *   play({ volume, rate }) — trigger (rate shifts pitch, volume is dB)
 *   setVolume(db)          — set output level
 *   stop() / dispose()
 *
 * Register some or all of them on a session so they show up as selectable
 * "synths" in the sound editor, e.g. in an app's build():
 *   import { registerToneSynths } from "../engine/sounds/toneSynths.js";
 *   registerToneSynths(gs);                 // all of them
 *   registerToneSynths(gs, ['blip','zap']); // a subset
 *
 * Tone is a global (loaded before the module graph), so referencing Tone.* in
 * the preset table at module load is safe.
 */

// Preset table. `pitched: false` marks voices with no musical pitch (noise),
// which are triggered by duration alone. `options` is passed to the synth ctor.
export const TONE_SYNTHS = {
  // Punchy kick drum — a MembraneSynth triggered at 43Hz (deep sub-bass).
  kick: {
    synth: Tone.MembraneSynth, note: '43Hz', duration: '8n',
    options: { octaves: 10, envelope: { sustain: 0, attack: 0.005, decay: 0.25 } },
  },
};

// Engine-compatible one-shot wrapper around a single preset.
export class ToneSynthSound {
  constructor(gameSession, preset = {}) {
    this.__gameSession = gameSession;
    this.__output = new Tone.Volume(preset.volume ?? 0);
    const SynthClass = preset.synth || Tone.Synth;
    this.__synth = new SynthClass(preset.options || {}).connect(this.__output);
    this.__note = preset.note ?? 'C3';
    this.__duration = preset.duration ?? '16n';
    this.__pitched = preset.pitched !== false;
  }

  connect(node) { this.__output.connect(node); }

  setVolume(db) { this.__output.volume.value = db; }

  play(opts = {}) {
    if (opts.volume != null) this.__output.volume.value = opts.volume;
    try {
      if (this.__pitched) {
        const freq = Tone.Frequency(this.__note).toFrequency() * (opts.rate ?? 1);
        this.__synth.triggerAttackRelease(freq, this.__duration);
      } else {
        // Unpitched (noise): duration only.
        this.__synth.triggerAttackRelease(this.__duration);
      }
    } catch (e) { /* audio context not started yet */ }
  }

  stop() {}

  dispose() { this.__synth.dispose(); this.__output.dispose(); }
}

// Build one preset by name (with optional overrides), or null if unknown.
export function createToneSynth(gameSession, name, overrides = {}) {
  const preset = TONE_SYNTHS[name];
  if (!preset) return null;
  return new ToneSynthSound(gameSession, { ...preset, ...overrides });
}

// Register presets on a session's SoundManager so they appear in the sound
// editor. Defaults to all of them; pass a name list to register a subset.
export function registerToneSynths(gameSession, names = Object.keys(TONE_SYNTHS)) {
  for (const name of names) {
    if (TONE_SYNTHS[name]) {
      gameSession.soundManager.registerSound(name, new ToneSynthSound(gameSession, TONE_SYNTHS[name]));
    }
  }
}

export default TONE_SYNTHS;
