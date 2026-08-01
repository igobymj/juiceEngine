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
  // --- A small drum kit, all synthesized (no samples). MembraneSynth for the
  // pitched skins (kick/toms), NoiseSynth for the noisy ones (snare/clap/shaker),
  // MetalSynth for the metallic ones (hats/cowbell/crash). `volume` is a starting
  // level; a triggering object overrides it with its own per-object volume. ---

  // Punchy kick drum — a MembraneSynth triggered at 43Hz (deep sub-bass).
  kick: {
    synth: Tone.MembraneSynth, note: '43Hz', duration: '8n', volume: 0,
    options: { octaves: 10, envelope: { sustain: 0, attack: 0.005, decay: 0.25 } },
  },

  // Snappy snare — a short white-noise burst.
  snare: {
    synth: Tone.NoiseSynth, pitched: false, duration: '16n', volume: -8,
    options: { noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } },
  },

  // Handclap — a looser, pink-noise burst with a touch more tail than the snare.
  clap: {
    synth: Tone.NoiseSynth, pitched: false, duration: '16n', volume: -8,
    options: { noise: { type: 'pink' }, envelope: { attack: 0.004, decay: 0.28, sustain: 0 } },
  },

  // Shaker / closed maraca — a very short filtered-noise tick.
  shaker: {
    synth: Tone.NoiseSynth, pitched: false, duration: '32n', volume: -14,
    options: { noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } },
  },

  // Closed hi-hat — a tight metallic tick.
  hihat: {
    synth: Tone.MetalSynth, note: '400Hz', duration: '32n', volume: -18,
    options: { harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.06, release: 0.01 } },
  },

  // Open hi-hat — same voice, long shimmering tail.
  openhat: {
    synth: Tone.MetalSynth, note: '400Hz', duration: '8n', volume: -18,
    options: { harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.5, release: 0.08 } },
  },

  // 808 cowbell — the classic detuned-square honk (fun on off-beats).
  cowbell: {
    synth: Tone.MetalSynth, note: '540Hz', duration: '16n', volume: -14,
    options: { harmonicity: 1.4, modulationIndex: 22, resonance: 400, octaves: 1.2,
      envelope: { attack: 0.001, decay: 0.4, release: 0.1 } },
  },

  // Crash cymbal — big, long metallic wash.
  crash: {
    synth: Tone.MetalSynth, note: '300Hz', duration: '2n', volume: -20,
    options: { harmonicity: 5.1, modulationIndex: 40, resonance: 3000, octaves: 2,
      envelope: { attack: 0.001, decay: 1.5, release: 0.3 } },
  },

  // Low tom — a rounded pitched drum for fills.
  tomLo: {
    synth: Tone.MembraneSynth, note: '90Hz', duration: '8n', volume: -4,
    options: { octaves: 6, pitchDecay: 0.06, envelope: { attack: 0.005, decay: 0.3, sustain: 0 } },
  },

  // High tom — the same, tuned up.
  tomHi: {
    synth: Tone.MembraneSynth, note: '160Hz', duration: '8n', volume: -4,
    options: { octaves: 5, pitchDecay: 0.05, envelope: { attack: 0.005, decay: 0.22, sustain: 0 } },
  },

  // Rimshot / woodblock — a very short high click.
  rimshot: {
    synth: Tone.MembraneSynth, note: '440Hz', duration: '64n', volume: -6,
    options: { octaves: 2, pitchDecay: 0.008, envelope: { attack: 0.001, decay: 0.06, sustain: 0 } },
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
    const at = opts.at;   // audio-clock time (seconds) to trigger at; undefined → now
    if (opts.volume != null) {
      // Schedule the level at the hit time so per-hit volumes stay correct even when
      // several objects share one registered voice and pre-schedule ahead.
      if (at != null) this.__output.volume.setValueAtTime(opts.volume, at);
      else this.__output.volume.value = opts.volume;
    }
    try {
      if (this.__pitched) {
        const freq = Tone.Frequency(this.__note).toFrequency() * (opts.rate ?? 1);
        this.__synth.triggerAttackRelease(freq, this.__duration, at);
      } else {
        // Unpitched (noise): duration + time.
        this.__synth.triggerAttackRelease(this.__duration, at);
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
