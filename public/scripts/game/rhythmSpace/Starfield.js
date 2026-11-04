/*
 * Starfield — a procedural, scrolling star background for RTD's game mode.
 *
 * Stars drift straight down and wrap back to the top; a ship sitting still then
 * reads as flying up the screen. Parallax by depth (z) varies each star's speed,
 * size and brightness, so nearer stars rush past faster and brighter. Seeded
 * lazily once the canvas size is known.
 *
 * Registered as an update + render system behind the objects (lower priority);
 * the app's ModeManager enables it only in game mode.
 */

export default class Starfield {
  constructor(gameSession, opts = {}) {
    this.gs = gameSession;
    this.count = opts.count ?? 150;
    this.speed = opts.speed ?? 2.4;   // downward px/frame for the nearest (z=1) layer
    this.stars = null;                // [{ x, y, z }] — seeded on first update/render
  }

  _seed() {
    const w = this.gs.canvasWidth || 1;
    const h = this.gs.canvasHeight || 1;
    this.stars = [];
    for (let i = 0; i < this.count; i++) {
      this.stars.push({ x: Math.random() * w, y: Math.random() * h, z: 0.25 + Math.random() * 0.75 });
    }
  }

  update() {
    if (!this.stars) this._seed();
    const w = this.gs.canvasWidth;
    const h = this.gs.canvasHeight;
    for (const s of this.stars) {
      s.y += this.speed * s.z;                 // parallax: nearer stars scroll faster
      if (s.y > h) { s.y -= h; s.x = Math.random() * w; }   // wrap to the top
    }
  }

  render() {
    if (!this.stars) this._seed();
    const p = this.gs.p5;
    p.push();
    p.noStroke();
    for (const s of this.stars) {
      p.fill(140 + s.z * 115);                 // brighter when nearer
      p.circle(s.x, s.y, 0.6 + s.z * 1.9);     // bigger when nearer
    }
    p.pop();
  }
}
