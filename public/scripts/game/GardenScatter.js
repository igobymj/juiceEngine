/*
 * GardenScatter — decorative primitive flora for garden mode.
 *
 * Garden mode's connectable lines come from FoodManager (the same connect/
 * attach mechanic as play mode), so this system only scatters the *extra*
 * primitives — circles, arcs, dots, vees — that give the garden its variety.
 * They are drawn in the same dark fountain-pen ink style, placed with the same
 * Perlin-noise rejection sampling FoodManager uses, and are purely decorative
 * (the creature connects lines, not shapes).
 *
 * Rendered as an update()/render() system beneath the creatures. Shape jitter
 * is baked at spawn so nothing shimmers between frames.
 */

const TARGET_COUNT = 44;          // lots of shapes; mostly circles (planting zones)
const MIN_STROKE = 1.5;
const MAX_STROKE = 3.0;
const NOISE_SCALE = 0.006;
const NOISE_THRESHOLD = 0.45;
const MAX_TRIES_PER_ITEM = 40;   // more tries so non-overlapping zones pack in
const EDGE_MARGIN = 28;
const ZONE_GAP = 8;              // min gap (px) between zone edges
// Soil fill for a zone interior — a low-alpha brown tint so the inside reads
// as a subtle earthy patch against the cream background.
const SOIL = [96, 62, 30, 40];
// Shape kinds and their relative weights. Irregular circles dominate — they're
// the planting zones; arcs / dots / vees are occasional accents.
const SHAPE_KINDS = [
  { kind: 'circle', w: 10 },
  { kind: 'arc',    w: 3 },
  { kind: 'dot',    w: 2 },
  { kind: 'vee',    w: 2 },
];

export default class GardenScatter {
  constructor(gameSession) {
    this.gameSession = gameSession;
    this.enabled = false;
    this.items = [];
    this._needsSpawn = false;
    this._strokeColor = null;
    this._spawned = false;   // scatter persists once generated for the session
    this.previewMode = false;   // juice editor: show a couple of jittering zones
    this._previewItems = null;
  }

  enable() {
    this.enabled = true;
    if (!this._spawned) this._needsSpawn = true;
  }

  disable() {
    this.enabled = false;
  }

  // Juice-editor preview: draw two always-eligible zones so their jitter can be
  // tuned without entering garden mode.
  setPreview(on) {
    this.previewMode = on;
  }

  _ensurePreview() {
    const W = this.gameSession.canvasWidth, H = this.gameSession.canvasHeight;
    if (this._previewItems && this._pvW === W && this._pvH === H) return;
    this._pvW = W; this._pvH = H;
    const mk = (x, y, r) => ({
      kind: 'circle', x, y, radius: r, strokeWeight: 2.2,
      pts: this._ringPoints(r, 0, Math.PI * 2, Math.max(20, Math.min(72, Math.round(r / 2.2)))),
      _eligible: true,   // always eligible so the preview always jitters
    });
    // Kept left of centre so the right-hand juice panel doesn't cover them.
    this._previewItems = [mk(W * 0.3, H * 0.5, 80), mk(W * 0.52, H * 0.42, 46)];
  }

  update() {
    if (!this.enabled) return;
    if (this._needsSpawn) {
      this._spawn();
      this._needsSpawn = false;
      this._spawned = true;
    }
  }

  // The circle zone containing world point (x, y), or null. Zones are the only
  // valid planting areas and clip whatever grows inside them. Returns a
  // { cx, cy, r, pts } descriptor (pts = the zone's irregular polygon).
  zoneAt(x, y) {
    for (const it of this.items) {
      if (it.kind !== 'circle') continue;
      const dx = x - it.x, dy = y - it.y;
      if (dx * dx + dy * dy <= it.radius * it.radius) {
        return { cx: it.x, cy: it.y, r: it.radius, pts: it.pts };
      }
    }
    return null;
  }

  _pickShapeKind(rand) {
    const total = SHAPE_KINDS.reduce((s, k) => s + k.w, 0);
    let r = rand * total;
    for (const k of SHAPE_KINDS) { if ((r -= k.w) <= 0) return k.kind; }
    return SHAPE_KINDS[0].kind;
  }

  // Jittered polyline points around a centre, sampled along `angleFrom..angleTo`
  // at `radius` with small radial + tangential noise. Baked once at spawn.
  _ringPoints(radius, angleFrom, angleTo, segs) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = angleFrom + (angleTo - angleFrom) * t;
      const rr = radius * (0.94 + Math.random() * 0.12);
      const wob = (Math.random() - 0.5) * radius * 0.06;
      pts.push({ x: Math.cos(a) * rr + wob, y: Math.sin(a) * rr - wob });
    }
    return pts;
  }

  _spawn() {
    const p = this.gameSession.p5;
    const w = this.gameSession.canvasWidth;
    const h = this.gameSession.canvasHeight;
    if (!p || !p.noise || w <= 0 || h <= 0) return;
    p.noiseSeed(Math.floor(Math.random() * 100000));
    this.items = [];
    const circles = [];   // placed zones {x, y, r} for overlap rejection
    let placed = 0;
    const maxTries = TARGET_COUNT * MAX_TRIES_PER_ITEM;
    for (let tries = 0; tries < maxTries && placed < TARGET_COUNT; tries++) {
      const x = EDGE_MARGIN + Math.random() * (w - EDGE_MARGIN * 2);
      const y = EDGE_MARGIN + Math.random() * (h - EDGE_MARGIN * 2);
      if (p.noise(x * NOISE_SCALE, y * NOISE_SCALE) < NOISE_THRESHOLD) continue;

      const strokeWeight = MIN_STROKE + Math.random() * (MAX_STROKE - MIN_STROKE);
      const kind = this._pickShapeKind(Math.random());
      const item = { kind, x, y, strokeWeight };
      if (kind === 'circle') {
        // Planting zones: wide continuous size range (tiny to very large),
        // biased toward smaller. Segment count scales with radius so big zones
        // stay smooth, not polygonal.
        const radius = 8 + Math.pow(Math.random(), 1.8) * 155;
        // Zones must not overlap each other (min ZONE_GAP between edges).
        let overlaps = false;
        for (const cc of circles) {
          const dx = x - cc.x, dy = y - cc.y, minD = radius + cc.r + ZONE_GAP;
          if (dx * dx + dy * dy < minD * minD) { overlaps = true; break; }
        }
        if (overlaps) continue;
        const segs = Math.max(20, Math.min(72, Math.round(radius / 2.2)));
        item.radius = radius;
        item.pts = this._ringPoints(radius, 0, Math.PI * 2, segs);
        circles.push({ x, y, r: radius });
      } else if (kind === 'arc') {
        const radius = 12 + Math.random() * 30;
        const start = Math.random() * Math.PI * 2;
        const sweep = Math.PI * (0.5 + Math.random());   // 90°–270°
        item.radius = radius;
        item.pts = this._ringPoints(radius, start, start + sweep, 16);
      } else if (kind === 'dot') {
        item.radius = 2 + Math.random() * 4;
      } else if (kind === 'vee') {
        const armA = 12 + Math.random() * 26, armB = 12 + Math.random() * 26;
        const dir = Math.random() * Math.PI * 2;
        const spread = (0.5 + Math.random()) * (Math.PI / 3);
        item.pts = [
          { x: Math.cos(dir - spread) * armA, y: Math.sin(dir - spread) * armA },
          { x: 0, y: 0 },
          { x: Math.cos(dir + spread) * armB, y: Math.sin(dir + spread) * armB },
        ];
      }
      this.items.push(item);
      placed++;
    }
  }

  // Mark which circle zones are "eligible" — a planting point is currently over
  // them. Eligible zones jitter as a cue. `points` are world-space planting
  // points (creature centres + line tips).
  updateEligibility(points) {
    for (const it of this.items) {
      if (it.kind !== 'circle') continue;
      let e = false;
      for (const pt of points) {
        const dx = pt.x - it.x, dy = pt.y - it.y;
        if (dx * dx + dy * dy <= it.radius * it.radius) { e = true; break; }
      }
      it._eligible = e;
    }
  }

  // Zone-jitter settings from the juice editor (container.garden.zoneJitter),
  // or null when disabled/absent.
  _zoneJitter() {
    const c = this.gameSession.juiceSettings
      && this.gameSession.juiceSettings.container
      && this.gameSession.juiceSettings.container.garden
      && this.gameSession.juiceSettings.container.garden.zoneJitter;
    if (!c || c.active === false) return null;
    const amp = +c.amplitude || 0;
    if (amp <= 0) return null;
    return { amp, interval: +c.interval || 90 };
  }

  render() {
    const p = this.gameSession.p5;
    if (!p) return;
    // Juice-editor preview: just the two always-jittering zones.
    if (this.previewMode) {
      if (!this._strokeColor) this._strokeColor = p.color(20);
      this._ensurePreview();
      const zj = this._zoneJitter();
      const now = performance.now();
      p.push();
      p.strokeCap(p.ROUND);
      p.strokeJoin(p.ROUND);
      for (const it of this._previewItems) this._drawInkPath(p, it, zj, now);
      p.pop();
      return;
    }
    if (!this.enabled || this.items.length === 0) return;
    if (!this._strokeColor) this._strokeColor = p.color(20);
    const zj = this._zoneJitter();
    const now = performance.now();
    p.push();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
    for (const it of this.items) {
      if (it.kind === 'dot') {
        p.noStroke();
        p.fill(this._strokeColor);
        p.circle(it.x, it.y, it.radius * 2);
      } else {
        this._drawInkPath(p, it, zj, now);
      }
    }
    p.pop();
  }

  // Stroke a baked local-space polyline (circle / arc / vee) in ink. Eligible
  // circle zones get a subtle per-vertex jitter, refreshed on the juice-set
  // interval, so they twitch slightly while a planting point is over them.
  _drawInkPath(p, it, zj, now) {
    const jitter = zj && it.kind === 'circle' && it._eligible;
    if (jitter && (!it._jOff || it._jOff.length !== it.pts.length || now - it._jTime > zj.interval)) {
      it._jOff = it.pts.map(() => ({
        x: (Math.random() * 2 - 1) * zj.amp,
        y: (Math.random() * 2 - 1) * zj.amp,
      }));
      it._jTime = now;
    }
    // World points (with jitter offsets when eligible) — shared by fill + stroke.
    const world = [];
    for (let i = 0; i < it.pts.length; i++) {
      const o = jitter ? it._jOff[i] : null;
      world.push([it.x + it.pts[i].x + (o ? o.x : 0), it.y + it.pts[i].y + (o ? o.y : 0)]);
    }
    // Zone interiors get a subtle darker soil fill.
    if (it.kind === 'circle') {
      p.noStroke();
      p.fill(SOIL[0], SOIL[1], SOIL[2], SOIL[3]);
      p.beginShape();
      for (const w of world) p.vertex(w[0], w[1]);
      p.endShape(p.CLOSE);
    }
    p.noFill();
    p.stroke(this._strokeColor);
    p.strokeWeight(it.strokeWeight);
    p.beginShape();
    for (const w of world) p.vertex(w[0], w[1]);
    p.endShape();
  }
}
