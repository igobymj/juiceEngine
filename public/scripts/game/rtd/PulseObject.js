/*
 * PulseObject — a rhythm element for RTD: a circle that pulses on the beat and
 * plays a sound at the moment of each pulse.
 *
 * It carries its own editable "type" parameters (radius, color, tempo, how big
 * the pulse is, how fast it relaxes, which sound), so the RTD editor tunes one
 * of these the way the primitives editor tunes a creature. Timing runs off the
 * unscaled realTimeSinceStartup clock so the beat stays steady.
 */

export default class PulseObject {
  constructor(gameSession, opts = {}) {
    this.gameSession = gameSession;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;

    // --- editable type parameters ---
    this.radius = opts.radius ?? 60;         // base radius (px)
    this.color = opts.color ?? '#8b7bd8';
    this.bpm = opts.bpm ?? 100;              // pulse tempo
    this.pulseScale = opts.pulseScale ?? 1.6; // scale reached at the moment of a beat
    this.relax = opts.relax ?? 0.16;          // ease-back per frame toward rest (0..1)
    this.sound = opts.sound ?? 'kick';        // registered sound name to play on beat

    // --- runtime state ---
    this.__scale = 1;
    this.__nextBeat = this.gameSession.timeManager.realTimeSinceStartup; // fire immediately
    this.selected = false;
  }

  // Current beat interval in ms.
  get interval() { return 60000 / Math.max(1, this.bpm); }

  update() {
    const t = this.gameSession.timeManager.realTimeSinceStartup;
    if (t >= this.__nextBeat) {
      this.pulse();
      this.__nextBeat += this.interval;
      // If we fell far behind (e.g. tab was backgrounded), resync.
      if (this.__nextBeat < t) this.__nextBeat = t + this.interval;
    }
    // Ease the scale back toward its rest size of 1.
    this.__scale += (1 - this.__scale) * this.relax;
  }

  pulse() {
    this.__scale = this.pulseScale;
    const snd = this.sound && this.gameSession.soundManager.getSound(this.sound);
    if (snd && typeof snd.play === 'function') snd.play();
  }

  render() {
    const p = this.gameSession.p5;
    const d = this.radius * 2 * this.__scale;
    p.push();
    p.noStroke();
    p.fill(this.color);
    p.circle(this.x, this.y, d);
    if (this.selected) {
      p.noFill();
      p.stroke(255, 255, 255, 180);
      p.strokeWeight(1.5);
      p.circle(this.x, this.y, this.radius * 2 + 14);
    }
    p.pop();
  }

  // Hit test in screen space (uses the rest radius so it's easy to click).
  contains(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}
