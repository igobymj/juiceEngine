/*
 * InkManager — ink-garden simulation ported from the standalone inkBlot app.
 *
 * A blot is "planted" at a point (e.g. the creature's position); it soaks into
 * the world over time, growing a lumpy body plus style-specific tendrils or a
 * branching root system. Where a growing tip touches another blot's limb it
 * seeds a smaller child blot, so a planted patch spreads into a colony.
 *
 * Engine integration: this is a plain update()/render() system (like
 * FoodManager). Finished blots are baked into an offscreen `committed` canvas;
 * each frame the committed layer plus any still-soaking blots are composited
 * onto the main p5 canvas with a `multiply` blend, so ink stains the ground
 * beneath the creatures.
 *
 * The simulation core (drop lifecycle, tendril/branch geometry, contact
 * spawning) is a faithful port; the DOM pen/inkwell UI, scrolling, and manual
 * DPR bookkeeping from the original are dropped — we draw in p5's own
 * coordinate space and let p5 handle pixel density.
 */

// ---- tuning constants (ported) ---------------------------------------------
const DROP_INIT_R = 1;
const DROP_MAX_R = 23;
const SOAK_MS = 1100;
const TENDRIL_MS = 120000;
const TIP_SPAWN_SCALE = 0.25;
const TIP_CONTACT_DIST = 3;
const TIP_SPAWN_MIN_RADIUS = 4;
const TIP_SPAWN_MAX_GEN = 5;
const MAX_ACTIVE_DROPS = 60;
const CONTACT_CHECK_MS = 120;
const BRANCH_MAX_DEPTH = 3;
const SOAK_SPREAD_MIN = 1.12;
const SOAK_SPREAD_MAX = 1.24;
const TENDRIL_STATIONS = 16;
// Held-bead growth (infinite ink): a drop grows toward GROW_MAX_R while the
// button is down, decelerating on the GROW_TAU_MS time constant. Kept modest
// so beads don't spawn huge tendril cascades that swamp the framerate.
const GROW_MAX_R = 26;
const GROW_TAU_MS = 1000;
// Soaking blots are re-rendered into an offscreen buffer that's blitted every
// frame; the buffer itself is only rebuilt periodically. Because growth
// decelerates, the rebuild interval scales with the YOUNGEST soaking drop's
// age: a just-spawned blot changes fast so the buffer rebuilds almost every
// frame; as everything ages the interval stretches toward LIVE_INTERVAL_MAX,
// so a settled garden costs just a couple of static blits per frame. Each
// LIVE_INTERVAL_STEP_MS of the youngest drop's age adds one frame to the gap.
const LIVE_INTERVAL_STEP_MS = 350;
const LIVE_INTERVAL_MAX = 20;
// Contact targets are capped so the O(n²) scan stays bounded as a colony grows.
const MAX_CONTACT_TARGETS = 220;

// Ink palette; each colour is bound to a blot style. Exported so the gardener
// (creature) can pick what it plants.
export const INK_TYPES = [
  { name: "Blue-Black", hex: "#1b2a4a", style: "linear"  },
  { name: "Iron Gall",  hex: "#241f1c", style: "organic" },
  { name: "Oxblood",    hex: "#5a1220", style: "blot"    },
  { name: "Verdigris",  hex: "#17603f", style: "single"  },
  { name: "Gamboge",    hex: "#d8a200", style: "branch"  },
];

// ---- small helpers ---------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function dropLandedRadius(d) {
  const sp = d.soakProgress ?? 1;
  const eased = 1 - (1 - sp) * (1 - sp);
  return (d.baseRadius ?? d.releaseRadius) * (1 + ((d.soakSpread ?? 1) - 1) * eased);
}
function dropTendrilGrow(d) {
  const tp = d.tendrilProgress ?? 1;
  return 1 - (1 - tp) * (1 - tp);
}
function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - (ax + u * dx), ey = py - (ay + u * dy);
  return ex * ex + ey * ey;
}

// ---- geometry generators (ported, deterministic per drop seed) -------------
function makeSplatter(d) {
  const blot = d.style === 'blot';
  const rnd = mulberry32(d.seed);
  const r = d.releaseRadius;
  const count = (blot ? 9 : 4) + Math.floor(r / (blot ? 4 : 7));
  const arr = [];
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = r * (1.05 + rnd() * (blot ? 1.7 : 0.95));
    const size = r * (0.05 + rnd() * (blot ? 0.2 : 0.14));
    arr.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, r: size, alpha: 0.72 + rnd() * 0.22 });
  }
  return arr;
}

function makeBlobEdge(d, samples) {
  const rnd = mulberry32(d.seed ^ 0x2d2d);
  const raw = new Array(samples);
  for (let i = 0; i < samples; i++) raw[i] = rnd();
  const edge = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const a = raw[(i - 2 + samples) % samples];
    const b = raw[(i - 1 + samples) % samples];
    const c = raw[i];
    const dd = raw[(i + 1) % samples];
    const e = raw[(i + 2) % samples];
    edge[i] = 0.78 + ((a + b + c + dd + e) / 5) * 0.44;
  }
  return edge;
}

function makeTendrils(d) {
  const rnd = mulberry32(d.seed ^ 0x1c1c);
  const r = d.releaseRadius;
  const count = 14 + Math.floor(r / 2.2);
  const arr = [];
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2;
    const u = rnd();
    const length = r * (0.84 + u * u * 8.1);
    const curl = (rnd() - 0.5) * 0.55;
    const width = r * (0.04 + rnd() * 0.07);
    const alpha = 0.52 + rnd() * 0.38;
    arr.push({ angle, length, curl, width, alpha, subseed: (rnd() * 1e9) | 0 });
  }
  return arr;
}

function makeBranchTendrils(d) {
  const rnd = mulberry32(d.seed ^ 0x1c1c);
  const r = d.releaseRadius;
  const segs = [];
  const rootCount = 6 + Math.floor(rnd() * 5);
  function grow(ox, oy, angle, length, width, depth, growStart, rootId) {
    segs.push({ ox, oy, angle, length, width, growStart, rootId, subseed: (rnd() * 1e9) | 0 });
    if (depth >= BRANCH_MAX_DEPTH || length < r * 0.5) return;
    const nChildren = rnd() < 0.65 ? 2 : 1;
    for (let i = 0; i < nChildren; i++) {
      const frac = 0.3 + rnd() * 0.5;
      const dir = nChildren === 2 ? (i === 0 ? 1 : -1) : (rnd() < 0.5 ? -1 : 1);
      const spread = (0.3 + rnd() * 0.45) * dir;
      const bx = ox + Math.cos(angle) * length * frac;
      const by = oy + Math.sin(angle) * length * frac;
      const childLen = length * (0.55 + rnd() * 0.2);
      const childWidth = width * 0.68;
      const childStart = Math.min(0.95, growStart + (1 - growStart) * frac);
      grow(bx, by, angle + spread, childLen, childWidth, depth + 1, childStart, rootId);
    }
  }
  for (let i = 0; i < rootCount; i++) {
    const angle = (i / rootCount) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const length = r * (1.6 + rnd() * 3.0);
    const width = r * (0.11 + rnd() * 0.05);
    grow(Math.cos(angle) * (r * 0.9), Math.sin(angle) * (r * 0.9), angle, length, width, 0, 0, i);
  }
  return segs;
}

function tendrilWander(tend) {
  if (tend.wander) return tend.wander;
  const wr = mulberry32(tend.subseed >>> 0);
  const f1 = wr() < 0.4 ? 2 : 1;
  const f2 = f1 + (wr() < 0.5 ? 1 : 2);
  const a1 = tend.curl * 0.5;
  const a2 = (wr() - 0.5) * 0.24;
  const N = TENDRIL_STATIONS;
  const roughL = new Array(N + 1), roughR = new Array(N + 1);
  for (let i = 0; i <= N; i++) { roughL[i] = wr() * 2 - 1; roughR[i] = wr() * 2 - 1; }
  tend.wander = { f1, f2, a1, a2, N, roughL, roughR };
  return tend.wander;
}

// ---- drawing (ported; draws in the current ctx coordinate space) -----------
function drawTendril(ctx, d, tend, radius, growFrac, solid = 1) {
  const len = tend.length * growFrac;
  if (len < 0.6) return;
  const [rC, gC, bC] = d.color;
  const rootR = radius * 0.92;
  const cosA = Math.cos(tend.angle), sinA = Math.sin(tend.angle);
  const px = -sinA, py = cosA;
  const style = d.style;
  const { f1, f2, a1, a2, N, roughL, roughR } = tendrilWander(tend);
  const baseW = tend.width;
  const roughAmp = baseW * 0.4;
  const minHalf = baseW * 0.05;
  const left = new Array(N + 1), right = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const along = rootR + len * t;
    const offset =
      style === 'linear' ? 0 :
      style === 'single' ? len * a1 * Math.sin(Math.PI * t) :
      len * (a1 * Math.sin(f1 * Math.PI * t) + a2 * Math.sin(f2 * Math.PI * t));
    const cx = d.cx + cosA * along + px * offset;
    const cy = d.cy + sinA * along + py * offset;
    const halfW = 0.5 * baseW * (0.15 + 1.75 * (1 - t));
    const edgeRough = roughAmp * (0.2 + 1.1 * (1 - t));
    const lw = Math.max(minHalf, halfW + roughL[i] * edgeRough);
    const rw = Math.max(minHalf, halfW + roughR[i] * edgeRough);
    left[i] = [cx + px * lw, cy + py * lw];
    right[i] = [cx - px * rw, cy - py * rw];
  }
  const a = tend.alpha * 0.85;
  ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + bC + ',' + (a + (1 - a) * solid) + ')';
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawBranchSegment(ctx, d, seg, globalGrow, solid) {
  const segGrow = seg.growStart >= 1 ? 0
    : Math.max(0, Math.min(1, (globalGrow - seg.growStart) / (1 - seg.growStart)));
  const L = seg.length * segGrow;
  if (L < 0.6) return;
  const [rC, gC, bC] = d.color;
  const cosA = Math.cos(seg.angle), sinA = Math.sin(seg.angle);
  const px = -sinA, py = cosA;
  const bx = d.cx + seg.ox, by = d.cy + seg.oy;
  const baseW = seg.width;
  const roughAmp = baseW * 0.35, minHalf = baseW * 0.05;
  const wr = mulberry32(seg.subseed >>> 0);
  const N = 8;
  const left = new Array(N + 1), right = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const ax = bx + cosA * L * u, ay = by + sinA * L * u;
    const halfW = 0.5 * baseW * (0.25 + 1.3 * (1 - u));
    const er = roughAmp * (0.2 + 1.0 * (1 - u));
    const lw = Math.max(minHalf, halfW + (wr() * 2 - 1) * er);
    const rw = Math.max(minHalf, halfW + (wr() * 2 - 1) * er);
    left[i] = [ax + px * lw, ay + py * lw];
    right[i] = [ax - px * rw, ay - py * rw];
  }
  const a = 0.82;
  ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + bC + ',' + (a + (1 - a) * solid) + ')';
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawLandedDrop(ctx, d, radius, growFrac, solid = 1) {
  const [rC, gC, bC] = d.color;
  const sol = (a) => a + (1 - a) * solid;
  const haloR = radius * 1.55;
  // Radial gradients are expensive to allocate; the halo is static once the
  // body stops growing (~1.1s), so cache it and rebuild only when `radius`
  // actually changes. This removes ~all per-frame gradient churn for the long
  // tendril tail — the main framerate cost.
  if (!d._halo || d._haloR !== radius) {
    const hg = ctx.createRadialGradient(d.cx, d.cy, radius * 0.55, d.cx, d.cy, haloR);
    hg.addColorStop(0, 'rgba(' + rC + ',' + gC + ',' + bC + ',0.24)');
    hg.addColorStop(0.55, 'rgba(' + rC + ',' + gC + ',' + bC + ',0.09)');
    hg.addColorStop(1, 'rgba(' + rC + ',' + gC + ',' + bC + ',0)');
    d._halo = hg; d._haloR = radius;
  }
  ctx.fillStyle = d._halo;
  ctx.fillRect(d.cx - haloR, d.cy - haloR, haloR * 2, haloR * 2);
  if (d.tendrils) {
    if (d.style === 'branch') {
      for (const seg of d.tendrils) drawBranchSegment(ctx, d, seg, growFrac, solid);
    } else {
      for (const t of d.tendrils) drawTendril(ctx, d, t, radius, growFrac, solid);
    }
  }
  const bodyAlpha = sol(0.93);
  if (d.blobEdge) {
    const n = d.blobEdge.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = radius * d.blobEdge[i];
      const x = d.cx + Math.cos(a) * rr, y = d.cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + bC + ',' + bodyAlpha + ')';
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + bC + ',' + bodyAlpha + ')';
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.splatter) {
    // Splatter dots are fixed in place; only their alpha ramps with `solid`.
    // Cache the gradients, rebuilding only when radius or a coarsely-quantised
    // solidity changes (≈12 rebuilds over the whole 2-minute ramp, vs 7000+).
    const key = d._haloR + ':' + Math.round(solid * 12);
    if (!d._splat || d._splatKey !== key) {
      d._splat = d.splatter.map((s) => {
        const rr = s.r, cx = d.cx + s.dx, cy = d.cy + s.dy;
        const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        sg.addColorStop(0, 'rgba(' + rC + ',' + gC + ',' + bC + ',' + sol(s.alpha) + ')');
        sg.addColorStop(0.55, 'rgba(' + rC + ',' + gC + ',' + bC + ',' + sol(s.alpha * 0.7) + ')');
        sg.addColorStop(1, 'rgba(' + rC + ',' + gC + ',' + bC + ',0)');
        return { g: sg, cx, cy, rr };
      });
      d._splatKey = key;
    }
    for (const sp of d._splat) {
      ctx.fillStyle = sp.g;
      ctx.fillRect(sp.cx - sp.rr, sp.cy - sp.rr, sp.rr * 2, sp.rr * 2);
    }
  }
}

// A held, still-growing bead: a crisp filled disc with a small glossy
// highlight, drawn at its current radius.
function drawGrowingDrop(ctx, d) {
  const [rC, gC, bC] = d.color;
  ctx.fillStyle = 'rgba(' + rC + ',' + gC + ',' + bC + ',0.95)';
  ctx.beginPath();
  ctx.arc(d.cx, d.cy, d.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(d.cx - d.radius * 0.3, d.cy - d.radius * 0.34, d.radius * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

// A soaking drop rendered live: pooling body deepens to opaque over its
// tendril timeline, tendrils/branches creeping outward.
function drawSoakingDrop(ctx, d) {
  const p = d.soakProgress;
  const eased = 1 - (1 - p) * (1 - p);
  const currR = d.baseRadius * (1 + (d.soakSpread - 1) * eased);
  const tp = d.tendrilProgress ?? p;
  const tendrilGrow = 1 - (1 - tp) * (1 - tp);
  drawLandedDrop(ctx, d, currR, tendrilGrow, tp);
}

// A planting zone is { cx, cy, r, pts } — an irregular circle in world space.
// Blots planted in a zone are clipped to its polygon so growth stays inside it.
function clipToZone(ctx, zone) {
  const pts = zone.pts;
  ctx.beginPath();
  ctx.moveTo(zone.cx + pts[0].x, zone.cy + pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(zone.cx + pts[i].x, zone.cy + pts[i].y);
  ctx.closePath();
  ctx.clip();
}
function pointInZone(zone, x, y) {
  const dx = x - zone.cx, dy = y - zone.cy;
  return dx * dx + dy * dy <= zone.r * zone.r;
}

// Draw a landed/soaking blot, clipped to its zone when it has one.
function drawClipped(ctx, d, drawFn) {
  if (d.zone) { ctx.save(); clipToZone(ctx, d.zone); drawFn(ctx, d); ctx.restore(); }
  else drawFn(ctx, d);
}

export default class InkManager {
  constructor(gameSession) {
    this.gameSession = gameSession;
    this.enabled = false;       // modal: only runs in garden mode
    // Optional juice event fired when a blot splats (lands and starts soaking).
    // Only primary splats (planted blots / released beads, gen 0) fire it, so a
    // spreading colony's cascade children don't spam it. Set by the app.
    this.splatEvent = null;
    this._pausedAt = null;
    this.activeDrops = [];      // still soaking / growing
    this.committedDrops = [];   // finished — kept as contact targets
    this.committed = null;      // offscreen baked-ink canvas (finished blots)
    this.cctx = null;
    this.live = null;           // offscreen buffer for soaking blots (throttled)
    this.lctx = null;
    this._bufW = 0;
    this._bufH = 0;
    this._density = 1;
    this._sinceLive = 0;        // frames since the live buffer was last rebuilt
    this._liveDirty = true;     // force a live-buffer redraw next render
    this.lastContactCheck = 0;
  }

  // Enable/disable the whole system (bound to garden mode). Growth is frozen
  // while disabled: on resume, every drop's clock is shifted forward by the
  // paused interval so nothing lurches ahead after time away from the tab.
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      this._pausedAt = performance.now();
    } else if (this._pausedAt != null) {
      const gap = performance.now() - this._pausedAt;
      for (const d of this.activeDrops) {
        if (d.soakStart != null) d.soakStart += gap;
        if (d.growStart != null) d.growStart += gap;
      }
      this.lastContactCheck += gap;
      this._pausedAt = null;
    }
  }

  // (Re)create the offscreen committed buffer to match the live canvas backing
  // store. On resize the baked ink is rebuilt from committedDrops so nothing is
  // lost.
  _ensureBuffer() {
    const p = this.gameSession.p5;
    if (!p || !p.canvas) return false;
    const pw = p.canvas.width, ph = p.canvas.height;
    if (pw === this._bufW && ph === this._bufH && this.committed) return true;
    this._bufW = pw; this._bufH = ph;
    this._density = this.gameSession.canvasWidth > 0 ? pw / this.gameSession.canvasWidth : 1;
    this.committed = document.createElement('canvas');
    this.committed.width = pw;
    this.committed.height = ph;
    this.cctx = this.committed.getContext('2d');
    this.cctx.setTransform(this._density, 0, 0, this._density, 0, 0);
    this.live = document.createElement('canvas');
    this.live.width = pw;
    this.live.height = ph;
    this.lctx = this.live.getContext('2d');
    this.lctx.setTransform(this._density, 0, 0, this._density, 0, 0);
    // Cached gradients are bound to their old context; drop them so they're
    // rebuilt against the new buffers.
    for (const d of this.committedDrops) { d._halo = null; d._splat = null; }
    for (const d of this.activeDrops) { d._halo = null; d._splat = null; }
    // Rebake existing finished drops at the new size, and force a live redraw.
    for (const d of this.committedDrops) {
      this.cctx.save();
      if (d.zone) clipToZone(this.cctx, d.zone);
      drawLandedDrop(this.cctx, d, d.baseRadius * d.soakSpread, 1);
      this.cctx.restore();
    }
    this._liveDirty = true;
    return true;
  }

  // Plant a blot at world (x, y). `ink` is an INK_TYPES entry; the drop starts
  // soaking immediately (no fall) and grows over its timeline. `tendrilMs`
  // overrides the (long) default growth window — pen-mode dots pass a short one
  // so they settle and bake quickly.
  plant(x, y, ink, radius = 14, tendrilMs = TENDRIL_MS, zone = null) {
    if (!this.enabled) return null;
    if (this.activeDrops.length >= MAX_ACTIVE_DROPS) return null;
    const d = {
      type: 'drop', color: hexToRgb(ink.hex), style: ink.style, gen: 0,
      cx: x, cy: y, seed: (Math.random() * 1e9) | 0, zone,
      state: 'soaking', releaseRadius: radius, radius, baseRadius: radius,
      soakProgress: 0, tendrilProgress: 0, tendrilMs,
      splatter: null, soakSpread: null, blobEdge: null, tendrils: null,
    };
    this._initSoak(d, performance.now());
    this.activeDrops.push(d);
    this._liveDirty = true;
    return d;
  }

  // Start a bead that grows while a button is held (see releaseGrowing). Used
  // for the "drops at line ends" gesture. Infinite ink — growth is time-based.
  plantGrowing(x, y, ink, zone = null) {
    if (!this.enabled) return null;
    if (this.activeDrops.length >= MAX_ACTIVE_DROPS) return null;
    const d = {
      type: 'drop', color: hexToRgb(ink.hex), style: ink.style, gen: 0,
      cx: x, cy: y, seed: (Math.random() * 1e9) | 0, zone,
      state: 'growing', growStart: performance.now(),
      radius: DROP_INIT_R, releaseRadius: DROP_INIT_R, baseRadius: DROP_INIT_R,
      soakProgress: 0, tendrilProgress: 0,
      splatter: null, soakSpread: null, blobEdge: null, tendrils: null,
    };
    this.activeDrops.push(d);
    return d;
  }

  // Release every held bead: each becomes a normal soaking blot at its current
  // size, spreading and contact-spawning as usual.
  releaseGrowing() {
    const t = performance.now();
    for (const d of this.activeDrops) {
      if (d.state !== 'growing') continue;
      d.releaseRadius = d.radius;
      d.baseRadius = d.radius;
      this._initSoak(d, t);
    }
    this._liveDirty = true;
  }

  _initSoak(d, t) {
    d.state = 'soaking';
    d.soakStart = t;
    d.baseRadius = d.releaseRadius;
    // 'dot' is a clean body-only blot (no splatter, no tendrils) — used for
    // pen-mode strokes where discrete specks/fuzz would read as noise.
    d.splatter = d.style === 'dot' ? null : makeSplatter(d);
    const rnd = mulberry32(d.seed ^ 0x5a5a);
    d.soakSpread = SOAK_SPREAD_MIN + rnd() * (SOAK_SPREAD_MAX - SOAK_SPREAD_MIN);
    d.blobEdge = makeBlobEdge(d, 44);
    d.tendrils = (d.style === 'blot' || d.style === 'dot') ? null
      : d.style === 'branch' ? makeBranchTendrils(d)
      : makeTendrils(d);
    // Fire the splat juice event for primary splats.
    const jem = this.gameSession.juiceEventManager;
    if (this.splatEvent && (d.gen || 0) === 0 && jem) {
      jem.addNew(this.splatEvent, { position: { x: d.cx, y: d.cy }, velocity: { x: 0, y: 0 } });
    }
  }

  _spawnBlot(x, y, color, style, parentReleaseRadius, gen, t, zone) {
    const r = parentReleaseRadius * TIP_SPAWN_SCALE;
    if (r < TIP_SPAWN_MIN_RADIUS || gen > TIP_SPAWN_MAX_GEN) return;
    if (this.activeDrops.length >= MAX_ACTIVE_DROPS) return;
    // Children only take root inside the parent's zone — colonies stay put.
    if (zone && !pointInZone(zone, x, y)) return;
    const d = {
      type: 'drop', color: color.slice(), style, gen,
      cx: x, cy: y, seed: (Math.random() * 1e9) | 0, zone,
      state: 'soaking', releaseRadius: r, radius: r, baseRadius: r,
      soakProgress: 0, tendrilProgress: 0,
      splatter: null, soakSpread: null, blobEdge: null, tendrils: null,
    };
    this._initSoak(d, t);
    this.activeDrops.push(d);
    this._liveDirty = true;
  }

  update() {
    if (!this.enabled) return;
    if (!this._ensureBuffer()) return;
    const t = performance.now();

    for (let i = this.activeDrops.length - 1; i >= 0; i--) {
      const d = this.activeDrops[i];
      if (d.state === 'growing') {
        const held = t - d.growStart;
        d.radius = DROP_INIT_R + (GROW_MAX_R - DROP_INIT_R) * (1 - Math.exp(-held / GROW_TAU_MS));
        continue;
      }
      const elapsed = t - d.soakStart;
      d.soakProgress = clamp(elapsed / SOAK_MS, 0, 1);
      d.tendrilProgress = clamp(elapsed / (d.tendrilMs || TENDRIL_MS), 0, 1);
      if (d.tendrilProgress >= 1) {
        // Cached gradients belong to the live context; drop them so the final
        // bake rebuilds against the committed context.
        d._halo = null; d._splat = null;
        this.cctx.save();
        if (d.zone) clipToZone(this.cctx, d.zone);
        drawLandedDrop(this.cctx, d, d.baseRadius * d.soakSpread, 1);
        this.cctx.restore();
        this._retire(d);
        this.activeDrops.splice(i, 1);
        this._liveDirty = true;
      }
    }

    if (t - this.lastContactCheck > CONTACT_CHECK_MS) {
      this.lastContactCheck = t;
      this._checkTendrilContacts(t);
    }
  }

  _retire(d) {
    this.committedDrops.push(d);
    if (this.committedDrops.length > MAX_CONTACT_TARGETS) this.committedDrops.shift();
  }

  // Redraw interval (in frames) for the soaking-blot buffer, set by the
  // youngest soaking drop: fresh → 1 (every frame), aging → longer.
  _liveInterval(now) {
    let minElapsed = Infinity;
    for (const d of this.activeDrops) {
      if (d.state !== 'soaking') continue;
      const e = now - d.soakStart;
      if (e < minElapsed) minElapsed = e;
    }
    if (minElapsed === Infinity) return LIVE_INTERVAL_MAX;
    return clamp(1 + Math.floor(minElapsed / LIVE_INTERVAL_STEP_MS), 1, LIVE_INTERVAL_MAX);
  }

  _redrawLive() {
    const lctx = this.lctx;
    lctx.save();
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, this.live.width, this.live.height);
    lctx.restore();   // back to the density transform
    for (const d of this.activeDrops) {
      if (d.state === 'soaking') drawClipped(lctx, d, drawSoakingDrop);
    }
  }

  render() {
    if (!this.enabled || !this.committed) return;

    // Nothing to composite → do no work. This keeps an empty garden as cheap
    // as play mode; the full-screen multiply blits below are only paid for once
    // there's actually ink on the page.
    const hasCommitted = this.committedDrops.length > 0;
    let hasSoaking = false, hasGrowing = false;
    for (const d of this.activeDrops) {
      if (d.state === 'growing') hasGrowing = true;
      else hasSoaking = true;
    }
    if (!hasCommitted && !hasSoaking && !hasGrowing) return;

    const p = this.gameSession.p5;
    const ctx = p.drawingContext;
    const W = this.gameSession.canvasWidth, H = this.gameSession.canvasHeight;
    const now = performance.now();

    // Rebuild the soaking-blot buffer on its adaptive cadence (or when forced).
    if (hasSoaking) {
      this._sinceLive++;
      if (this._liveDirty || this._sinceLive >= this._liveInterval(now)) {
        this._redrawLive();
        this._sinceLive = 0;
        this._liveDirty = false;
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    // Buffers are at backing-store resolution; draw them into CSS-pixel space
    // so p5's density transform maps them 1:1. Blit each layer only if it holds
    // something.
    if (hasCommitted) ctx.drawImage(this.committed, 0, 0, W, H);
    if (hasSoaking) ctx.drawImage(this.live, 0, 0, W, H);
    // Held beads are cheap and want to feel responsive — draw them per frame.
    if (hasGrowing) {
      for (const d of this.activeDrops) {
        if (d.state === 'growing') drawClipped(ctx, d, drawGrowingDrop);
      }
    }
    ctx.restore();
  }

  // ---- contact spawning (ported) ------------------------------------------
  _dropTendrilLines(d) {
    const g = dropTendrilGrow(d);
    const segs = [], tips = [];
    if (!d.tendrils) return { segs, tips, bound: 0 };
    let bound = 0;
    const consider = (ax, ay, bx, by, width, item) => {
      segs.push({ ax, ay, bx, by, thr: TIP_CONTACT_DIST + width, item });
      tips.push({ x: bx, y: by, item });
      const db = (bx - d.cx) * (bx - d.cx) + (by - d.cy) * (by - d.cy);
      if (db > bound) bound = db;
    };
    if (d.style === 'branch') {
      for (const s of d.tendrils) {
        const segGrow = s.growStart >= 1 ? 0
          : Math.max(0, Math.min(1, (g - s.growStart) / (1 - s.growStart)));
        const L = s.length * segGrow;
        if (L < 0.6) continue;
        const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
        const ax = d.cx + s.ox, ay = d.cy + s.oy;
        consider(ax, ay, ax + cosA * L, ay + sinA * L, s.width, s);
      }
    } else {
      const rootR = dropLandedRadius(d) * 0.92;
      for (const tend of d.tendrils) {
        const cosA = Math.cos(tend.angle), sinA = Math.sin(tend.angle);
        const ax = d.cx + cosA * rootR, ay = d.cy + sinA * rootR;
        const along = rootR + tend.length * g;
        consider(ax, ay, d.cx + cosA * along, d.cy + sinA * along, tend.width, tend);
      }
    }
    return { segs, tips, bound: Math.sqrt(bound) };
  }

  _spawnBlocked(src, item, other, otherItem) {
    if (item === otherItem) return true;
    if (src.style === 'branch' && other === src && item.rootId === otherItem.rootId) return true;
    return false;
  }

  _checkTendrilContacts(t) {
    const targets = [];
    for (const d of this.activeDrops) if (d.tendrils && d.tendrils.length) targets.push(d);
    for (const s of this.committedDrops) if (s.tendrils && s.tendrils.length) targets.push(s);
    if (targets.length < 2) return;

    for (const d of targets) {
      const lines = this._dropTendrilLines(d);
      d.__segs = lines.segs;
      d.__tips = lines.tips;
      d.__bound = lines.bound;
      d.__r = dropLandedRadius(d);
    }

    const spawns = [];
    for (const src of this.activeDrops) {
      if (src.state !== 'soaking' || !src.__tips) continue;
      const bodyR2 = src.__r * src.__r * 1.1;
      for (const tp of src.__tips) {
        const item = tp.item;
        if (item.spawned) continue;
        const dcx = tp.x - src.cx, dcy = tp.y - src.cy;
        if (dcx * dcx + dcy * dcy < bodyR2) continue;
        let hit = false;
        for (const other of targets) {
          const ddx = other.cx - src.cx, ddy = other.cy - src.cy;
          const reach = src.__bound + other.__bound + TIP_CONTACT_DIST + 4;
          if (ddx * ddx + ddy * ddy > reach * reach) continue;
          for (const sg of other.__segs) {
            if (this._spawnBlocked(src, item, other, sg.item)) continue;
            if (pointSegDist2(tp.x, tp.y, sg.ax, sg.ay, sg.bx, sg.by) <= sg.thr * sg.thr) { hit = true; break; }
          }
          if (hit) break;
        }
        if (hit) {
          item.spawned = true;
          spawns.push({ x: tp.x, y: tp.y, color: src.color, style: src.style, pr: src.releaseRadius, gen: (src.gen || 0) + 1, zone: src.zone });
        }
      }
    }
    for (const sp of spawns) this._spawnBlot(sp.x, sp.y, sp.color, sp.style, sp.pr, sp.gen, t, sp.zone);
  }
}
