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
  blip: {
    synth: Tone.Synth, note: 'C5', duration: '32n',
    options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.10, sustain: 0, release: 0.10 } },
  },
  zap: {
    synth: Tone.Synth, note: 'C6', duration: '32n',
    options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } },
  },
  pluck: {
    synth: Tone.PluckSynth, note: 'C4', duration: '8n',
    options: { dampening: 4000, resonance: 0.9 },
  },
  bass: {
    synth: Tone.MonoSynth, note: 'C2', duration: '8n',
    options: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.2 },
      filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.2, baseFrequency: 120, octaves: 3 },
    },
  },
  chime: {
    synth: Tone.FMSynth, note: 'C5', duration: '4n',
    options: { harmonicity: 3, modulationIndex: 10, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.6 } },
  },
  stab: {
    synth: Tone.AMSynth, note: 'C4', duration: '16n',
    options: { harmonicity: 2, envelope: { attack: 0.002, decay: 0.15, sustain: 0, release: 0.1 } },
  },
  clank: {
    synth: Tone.MetalSynth, note: 'C4', duration: '16n',
    options: { harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, envelope: { attack: 0.001, decay: 0.2, release: 0.1 } },
  },
  noise: {
    synth: Tone.NoiseSynth, duration: '16n', pitched: false,
    options: { noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } },
  },
  sweep: {
    synth: Tone.Synth, note: 'C3', duration: '4n',
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.2, decay: 0.1, sustain: 0.3, release: 0.4 } },
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
