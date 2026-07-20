/*
 * Fountain-pen line rendering.
 *
 * Pulled out of Creature so both creature lines (with animated smudge) and
 * static world-space objects like food can render in the same style.
 *
 * A "line spec" is { p1, p2, strokeWeight, penEffect }. A "smudge" is the
 * per-line random profile returned by generateSmudgeVariance(); it controls
 * the asymmetric taper, blob, halo, stroke-weight noise, and path wobble.
 *
 * Layers (back to front):
 *   1. Selection underlay (only if isSelected)
 *   2. Bleed halos at both endpoints (stronger at p2)
 *   3. Base line stroke — segmented, with stroke-weight + path noise
 *   4. Tapered widening along the last ~40% approaching p2
 *   5. Pooled ink blob at p2 and smaller touch at p1
 *   6. Selection endpoint dots (only if isSelected)
 */

// Path-wobble amplitude per unit of jitter, in pixels. Calibrated so the
// editor's "amplitude" slider at 10.0 yields peak ±4 px perpendicular offset.
const PATH_JITTER_PER_UNIT = 0.4;

// Range of valid segment counts ("frequency" slider). Smudge arrays are sized
// to MAX so a line can change segment count without regenerating its smudge.
export const MIN_SEGMENTS = 4;
export const MAX_SEGMENTS = 12;
export const DEFAULT_SEGMENTS = 6;

// Cumulative t values 0 < t[0] < ... < t[n-1] = 1, marking the right edge
// of each of `n` segments along the line. With weights null/omitted the
// segments are equal-length; with weights, segWeights[0..n-1] are normalized
// to set relative widths.
function _segmentTValues(n, weights) {
    const ts = new Array(n);
    if (!weights || weights.length < n) {
        for (let i = 0; i < n; i++) ts[i] = (i + 1) / n;
        return ts;
    }
    let total = 0;
    for (let i = 0; i < n; i++) total += weights[i];
    let cum = 0;
    for (let i = 0; i < n; i++) {
        cum += weights[i] / total;
        ts[i] = i === n - 1 ? 1 : cum;
    }
    return ts;
}

function _lerp(a, b, t) { return a + (b - a) * t; }

function _lerpArr(a, b, t) {
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
}

// Interpolate every smudge field linearly. Returns `a` unchanged when the
// caller hasn't picked a new state yet (a === b), avoiding allocation.
export function lerpSmudge(a, b, t) {
    if (a === b) return a;
    return {
        taperLenFactor:     _lerp(a.taperLenFactor,     b.taperLenFactor,     t),
        taperWidthFactor:   _lerp(a.taperWidthFactor,   b.taperWidthFactor,   t),
        taperSideBias:      _lerp(a.taperSideBias,      b.taperSideBias,      t),
        blobSizeFactor:     _lerp(a.blobSizeFactor,     b.blobSizeFactor,     t),
        blobOffsetPerp:     _lerp(a.blobOffsetPerp,     b.blobOffsetPerp,     t),
        blobStretch:        _lerp(a.blobStretch,        b.blobStretch,        t),
        blobRotation:       _lerp(a.blobRotation,       b.blobRotation,       t),
        p1TouchFactor:      _lerp(a.p1TouchFactor,      b.p1TouchFactor,      t),
        p1TouchOffsetPerp:  _lerp(a.p1TouchOffsetPerp,  b.p1TouchOffsetPerp,  t),
        haloFactor:         _lerp(a.haloFactor,         b.haloFactor,         t),
        haloOffsetPerp:     _lerp(a.haloOffsetPerp,     b.haloOffsetPerp,     t),
        strokeNoise:        _lerpArr(a.strokeNoise, b.strokeNoise, t),
        pathJitter:         _lerpArr(a.pathJitter,  b.pathJitter,  t),
        segWeights:         a.segWeights && b.segWeights
                                ? _lerpArr(a.segWeights, b.segWeights, t)
                                : (b.segWeights || a.segWeights),
    };
}

export function generateSmudgeVariance() {
    const rand = (min, max) => min + Math.random() * (max - min);
    return {
        taperLenFactor: rand(0.55, 1.4),
        taperWidthFactor: rand(0.85, 1.25),
        // -0.45..0.45: asymmetric widening across the line axis.
        taperSideBias: rand(-0.45, 0.45),
        // Blob at p2
        blobSizeFactor: rand(0.6, 1.1),
        blobOffsetPerp: rand(-0.4, 0.4),       // in strokeWeight units
        blobStretch: rand(0.85, 1.25),         // along-line stretch
        blobRotation: rand(-Math.PI / 5, Math.PI / 5),
        // Smaller touch at p1
        p1TouchFactor: rand(0.6, 1.1),
        p1TouchOffsetPerp: rand(-0.35, 0.35),
        // Halo at p2
        haloFactor: rand(0.8, 1.25),
        haloOffsetPerp: rand(-0.35, 0.35),
        // Per-segment stroke-weight noise; amplitude scales with penEffect.
        // Sized for MAX_SEGMENTS so a line can change segment count without
        // regenerating its smudge — the renderer uses the first N values.
        strokeNoise: Array.from({ length: MAX_SEGMENTS }, () => rand(-1, 1)),
        // Perpendicular wobble at interior segment boundaries (MAX_SEGMENTS-1).
        pathJitter: Array.from({ length: MAX_SEGMENTS - 1 }, () => rand(-1, 1)),
        // Relative segment widths used when randomSegmentLengths is true. Each
        // in [0.5, 1.5]; renderer normalizes the first N to sum to 1.
        segWeights: Array.from({ length: MAX_SEGMENTS }, () => rand(0.5, 1.5)),
    };
}

export function renderFountainPenLine(p, ln, smudge, strokeColor, jitter, isSelected = false, nominalLength = 0) {
    if (ln.penEffect == null) ln.penEffect = 1.0;                // safety net
    const sm = smudge;
    const sw = ln.strokeWeight;
    // Halved internally so slider 1.00 → 0.5 of the prior effect.
    const pe = ln.penEffect * 0.5;
    const r = p.red(strokeColor);
    const g = p.green(strokeColor);
    const b = p.blue(strokeColor);

    const dx = ln.p2.x - ln.p1.x;
    const dy = ln.p2.y - ln.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    let ux = 0, uy = 0, perpX = 0, perpY = 0;
    if (len > 0.001) {
        ux = dx / len; uy = dy / len;
        perpX = -uy;   perpY = ux;
    }

    if (isSelected) {
        p.noFill();
        p.stroke(60, 130, 200, 90);
        p.strokeWeight(sw + 6);
        p.line(ln.p1.x, ln.p1.y, ln.p2.x, ln.p2.y);
    }

    if (pe > 0.01) {
        const haloOX = perpX * sm.haloOffsetPerp * sw * pe;
        const haloOY = perpY * sm.haloOffsetPerp * sw * pe;
        p.noStroke();
        p.fill(r, g, b, 28);
        p.circle(ln.p2.x + haloOX, ln.p2.y + haloOY, sw * 4.2 * sm.haloFactor * pe);
        p.fill(r, g, b, 55);
        p.circle(ln.p2.x + haloOX * 0.5, ln.p2.y + haloOY * 0.5, sw * 2.6 * sm.haloFactor * pe);
        p.fill(r, g, b, 22);
        p.circle(ln.p1.x, ln.p1.y, sw * 2.4 * pe);
    }

    p.noFill();
    p.stroke(strokeColor);
    const noise = sm.strokeNoise;
    const noiseAmount = 0.10 * pe;
    const pathJitter = sm.pathJitter || [];
    // Jitter amplitude and segment count both scale linearly with line length
    // relative to the caller's nominal length. nominalLength <= 0 disables
    // scaling (i.e. legacy / unscaled callers).
    const lengthScale = nominalLength > 0 ? len / nominalLength : 1;
    const jitterAmount = PATH_JITTER_PER_UNIT * jitter * lengthScale;
    const requestedSegments = ln.segments ?? DEFAULT_SEGMENTS;
    const segCount = Math.max(
        MIN_SEGMENTS,
        Math.min(MAX_SEGMENTS, Math.round(requestedSegments * lengthScale)),
    );
    const ts = _segmentTValues(segCount, ln.randomSegmentLengths ? sm.segWeights : null);
    let prevX = ln.p1.x, prevY = ln.p1.y;
    for (let i = 0; i < segCount; i++) {
        let nextX, nextY;
        if (i === segCount - 1) {
            nextX = ln.p2.x;
            nextY = ln.p2.y;
        } else {
            const t = ts[i];
            const baseX = ln.p1.x + dx * t;
            const baseY = ln.p1.y + dy * t;
            const off = (pathJitter[i] || 0) * jitterAmount;
            nextX = baseX + perpX * off;
            nextY = baseY + perpY * off;
        }
        p.strokeWeight(sw * (1 + (noise[i] || 0) * noiseAmount));
        p.line(prevX, prevY, nextX, nextY);
        prevX = nextX;
        prevY = nextY;
    }

    if (pe > 0.01 && len > sw * 2) {
        const taperLen = Math.min(len * 0.4 * sm.taperLenFactor, sw * 8 * sm.taperLenFactor);
        const totalW = sw * 1.7 * sm.taperWidthFactor * pe;
        const wEndA = totalW * (0.5 + sm.taperSideBias);
        const wEndB = totalW * (0.5 - sm.taperSideBias);
        const wBackA = sw * 1.0 * pe * (0.5 + sm.taperSideBias * 0.4);
        const wBackB = sw * 1.0 * pe * (0.5 - sm.taperSideBias * 0.4);
        const tBackX = ln.p2.x - ux * taperLen;
        const tBackY = ln.p2.y - uy * taperLen;

        p.noStroke();
        p.fill(strokeColor);
        p.beginShape();
        p.vertex(tBackX + perpX * wBackA, tBackY + perpY * wBackA);
        p.vertex(tBackX - perpX * wBackB, tBackY - perpY * wBackB);
        p.vertex(ln.p2.x - perpX * wEndB, ln.p2.y - perpY * wEndB);
        p.vertex(ln.p2.x + perpX * wEndA, ln.p2.y + perpY * wEndA);
        p.endShape(p.CLOSE);
    }

    if (pe > 0.01) {
        p.noStroke();
        p.fill(strokeColor);
        const blobR = sw * 1.0 * sm.blobSizeFactor * pe;
        const blobX = ln.p2.x + perpX * sm.blobOffsetPerp * sw * pe;
        const blobY = ln.p2.y + perpY * sm.blobOffsetPerp * sw * pe;
        const lineAngle = Math.atan2(uy, ux);
        p.push();
        p.translate(blobX, blobY);
        p.rotate(lineAngle + sm.blobRotation);
        p.ellipse(0, 0, blobR * 2 * sm.blobStretch, blobR * 2);
        p.pop();

        const p1OX = perpX * sm.p1TouchOffsetPerp * sw * pe;
        const p1OY = perpY * sm.p1TouchOffsetPerp * sw * pe;
        p.circle(ln.p1.x + p1OX, ln.p1.y + p1OY, sw * 0.85 * sm.p1TouchFactor * pe);
    }

    if (isSelected) {
        p.fill(60, 130, 200, 230);
        p.circle(ln.p1.x, ln.p1.y, 6);
        p.circle(ln.p2.x, ln.p2.y, 6);
    }
}
