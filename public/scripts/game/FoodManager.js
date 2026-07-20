/*
 * FoodManager — scatters short horizontal/vertical line segments around the
 * canvas as "food" for creatures to consume. Active only while the app is in
 * play mode.
 *
 * Distribution uses Perlin-noise rejection sampling: random candidates are
 * accepted only when the noise field at that location exceeds a threshold,
 * producing organic clusters rather than uniform scatter.
 *
 * Contact: when a creature's body radius overlaps a food segment, the segment
 * is added as a new line on the creature in local space. Length and parallel
 * position are preserved; the perpendicular coordinate snaps to 0 when within
 * the editor's cardinal band (bodyRadius / 3), mirroring how the editor
 * places lines on click.
 */

import { generateSmudgeVariance, renderFountainPenLine } from "./fountainPen.js";

const TARGET_COUNT = 15;
const MIN_LENGTH = 24;
const MAX_LENGTH = 84;
// Reference length for jitter scaling — matches a default-radius creature
// (3 × diameter, with bodyRadius = 24).
const NOMINAL_LENGTH = 144;
const MIN_STROKE = 1.5;
const MAX_STROKE = 3.0;
const MIN_JITTER_AMP = 2.0;
const MAX_JITTER_AMP = 6.0;
const MIN_JITTER_FREQ = 4;
const MAX_JITTER_FREQ = 7;
// Each food line is rotated off its cardinal axis by a uniform random angle
// in this range (radians). Skew is preserved when the line is consumed.
const SKEW_RANGE_RAD = 3 * Math.PI / 180;
const PEN_EFFECT = 1.0;
// Activation: food is "ready to eat" when its line is within effectRadius
// body-radii of the creature center AND the food's orientation matches what
// the editor would place at that position relative to the creature. The
// radius (and the amplitude/rate of the accompanying jitter animation) are
// configured via the 'line proximity' juice event (proximityJitter effect);
// constants below are fallbacks used if that event/effect is absent from
// juiceSettings.
const DEFAULT_MAX_JITTER = 1.5;
const DEFAULT_MAX_ANIMATION_SPEED_HZ = 16; // ≈62.5 ms interval
const DEFAULT_EFFECT_RADIUS_MULT = 2;
const NOISE_SCALE = 0.006;
const NOISE_THRESHOLD = 0.45;
const MAX_TRIES_PER_ITEM = 20;
const EDGE_MARGIN = 24;

export default class FoodManager {
    constructor(gameSession, creatureManager) {
        this.gameSession = gameSession;
        this.creatureManager = creatureManager;
        this.items = [];
        this.enabled = false;
        // Deferred spawn flag: spawning needs canvas dimensions, which aren't
        // set until p5's setup runs. enable() flags; update() spawns lazily.
        this._needsSpawn = false;
        // Stroke color for food — cached on first render once p5 is ready.
        this._strokeColor = null;
        // Creatures whose jitter is currently being driven by nearby active
        // food, paired with their pre-override settings so we can restore them.
        this._animatedCreatures = new Map();
    }

    enable() {
        this.enabled = true;
        this._needsSpawn = true;
    }

    disable() {
        this.enabled = false;
        this.items = [];
        this._needsSpawn = false;
        // Restore any creatures we were driving.
        for (const [c, baseline] of this._animatedCreatures) {
            this._restoreCreature(c, baseline);
        }
        this._animatedCreatures.clear();
    }

    _spawn() {
        const p = this.gameSession.p5;
        const w = this.gameSession.canvasWidth;
        const h = this.gameSession.canvasHeight;
        if (!p || !p.noise || w <= 0 || h <= 0) return;
        p.noiseSeed(Math.floor(Math.random() * 100000));
        this.items = [];
        let placed = 0;
        const maxTries = TARGET_COUNT * MAX_TRIES_PER_ITEM;
        for (let tries = 0; tries < maxTries && placed < TARGET_COUNT; tries++) {
            const x = EDGE_MARGIN + Math.random() * (w - EDGE_MARGIN * 2);
            const y = EDGE_MARGIN + Math.random() * (h - EDGE_MARGIN * 2);
            if (p.noise(x * NOISE_SCALE, y * NOISE_SCALE) < NOISE_THRESHOLD) continue;
            const orientation = Math.random() < 0.5 ? 'h' : 'v';
            const length = MIN_LENGTH + Math.random() * (MAX_LENGTH - MIN_LENGTH);
            const strokeWeight = MIN_STROKE + Math.random() * (MAX_STROKE - MIN_STROKE);
            const jitter = MIN_JITTER_AMP + Math.random() * (MAX_JITTER_AMP - MIN_JITTER_AMP);
            // Frequency slider is integer segment count; pick uniformly inclusive.
            const segments = MIN_JITTER_FREQ + Math.floor(Math.random() * (MAX_JITTER_FREQ - MIN_JITTER_FREQ + 1));
            // Cardinal axis (0 for horizontal, π/2 for vertical) plus uniform
            // skew. Stored as a unit direction vector to avoid trig per frame.
            const baseAngle = orientation === 'h' ? 0 : Math.PI / 2;
            const angle = baseAngle + (Math.random() * 2 - 1) * SKEW_RANGE_RAD;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            this.items.push({
                x, y, orientation, length, strokeWeight, jitter, segments,
                dx, dy,
                smudge: generateSmudgeVariance(),
                active: false,
                activeCreature: null,
            });
            placed++;
        }
    }

    update() {
        if (!this.enabled) return;
        if (this._needsSpawn) {
            this._spawn();
            this._needsSpawn = false;
        }
        const creatures = this.creatureManager.creatures;
        const pj = this._proximityJitterSettings();
        // Pass 1: compute per-food activation. For each creature we test every
        // attachment zone (body + one hotspot per attached line's distant end);
        // food activates if any zone's radius + legality passes. Per creature,
        // remember the best t (normalized closeness in [0,1]) across all zones
        // so Pass 2 can drive the jitter ramp.
        const creatureMaxT = new Map();
        for (const f of this.items) {
            f.active = false;
            f.activeCreature = null;
            if (creatures.length === 0) continue;
            const p1 = this._p1(f);
            const p2 = this._p2(f);
            for (const c of creatures) {
                let bestT = -Infinity;
                const zones = this._activationZones(c, pj);
                for (const z of zones) {
                    const d = this._distanceToSegment(z.x, z.y, p1, p2);
                    if (d > z.outerR) continue;
                    if (!this._isLegal(f, z.x, z.y, c.bodyRadius)) continue;
                    // Span 0 (e.g. body zone with effectRadius = 1) collapses
                    // to a step; clamp to 1 pixel to avoid div-by-zero.
                    const span = Math.max(z.outerR - z.innerR, 1);
                    const t = Math.max(0, Math.min(1, (z.outerR - d) / span));
                    if (t > bestT) bestT = t;
                }
                if (bestT === -Infinity) continue;
                f.active = true;
                f.activeCreature = c;
                const prev = creatureMaxT.get(c);
                if (prev === undefined || bestT > prev) creatureMaxT.set(c, bestT);
                break;
            }
        }
        // Pass 2: drive creature jitter scaled by proximity. Capture baselines
        // on first activation, push live values each frame (applyJitterAnimation
        // bypasses the rebake-on-set behavior so smooth interpolation keeps
        // running between cycles). When the 'line proximity' juice effect is
        // disabled, skip pass 2 entirely — pass 3 will restore anything we were
        // already driving.
        if (pj.active) {
            for (const [c, t] of creatureMaxT) {
                if (!this._animatedCreatures.has(c)) {
                    this._animatedCreatures.set(c, {
                        jitter: c.jitter,
                        interval: c.jitterAnimateInterval,
                        smooth: c.smoothJitter,
                    });
                }
                const jitter = t * pj.maxJitter;
                const interval = Math.round(1000 / pj.maxAnimationSpeed);
                c.applyJitterAnimation(jitter, interval, true);
            }
        }
        // Pass 3: restore creatures that no longer have active food (or all of
        // them, when proximity jitter has been switched off), and drop map
        // entries for creatures that have been deleted from the world.
        for (const [c, baseline] of [...this._animatedCreatures]) {
            const stillDriven = pj.active && creatureMaxT.has(c) && creatures.includes(c);
            if (stillDriven) continue;
            if (creatures.includes(c)) this._restoreCreature(c, baseline);
            this._animatedCreatures.delete(c);
        }
    }

    // Pull live values from the juice container so edits in the juice editor
    // take effect immediately; fall back to constants if the event/effect is
    // absent (e.g. running against an older juice.json).
    _proximityJitterSettings() {
        const container = this.gameSession.juiceSettings?.container;
        const eff = container?.['line proximity']?.proximityJitter;
        if (!eff) {
            return {
                active: true,
                maxJitter: DEFAULT_MAX_JITTER,
                maxAnimationSpeed: DEFAULT_MAX_ANIMATION_SPEED_HZ,
                effectRadius: DEFAULT_EFFECT_RADIUS_MULT,
            };
        }
        const num = (v, d) => (Number.isFinite(+v) ? +v : d);
        return {
            active: eff.active !== false,
            maxJitter: num(eff.maxJitter, DEFAULT_MAX_JITTER),
            maxAnimationSpeed: num(eff.maxAnimationSpeed, DEFAULT_MAX_ANIMATION_SPEED_HZ),
            effectRadius: num(eff.effectRadius, DEFAULT_EFFECT_RADIUS_MULT),
        };
    }

    _restoreCreature(c, baseline) {
        c.jitter = baseline.jitter;
        c.jitterAnimateInterval = baseline.interval;
        c.smoothJitter = baseline.smooth;
    }

    // Spacebar handler — consumes every active food via the creature that
    // triggered it. Any food not currently active is ignored.
    keyPressed(key) {
        if (!this.enabled) return;
        if (key !== ' ') return;
        for (let i = this.items.length - 1; i >= 0; i--) {
            const f = this.items[i];
            if (f.active && f.activeCreature) {
                this._consume(f.activeCreature, f);
                this.items.splice(i, 1);
            }
        }
    }

    // Mirror of the editor's _startPendingLine snap rule: based on which
    // cardinal axis dominates the food's position relative to a pivot and
    // whether it sits inside the cardinal band, decide which orientation the
    // editor would assign at that pivot. Legal == matches the food's actual
    // orientation. Pivot is world-space; used for both the creature center
    // and the distant-endpoint attach hotspots on existing lines.
    _isLegal(food, pivotX, pivotY, bodyRadius) {
        const lx = food.x - pivotX;
        const ly = food.y - pivotY;
        // Wider than the editor's r/3 cardinal band — opens the per-axis wedge
        // making attachment forgiving of imprecise approach.
        const band = bodyRadius * (2 / 3);
        const cardinalIsHorizontal = Math.abs(lx) >= Math.abs(ly);
        let expected;
        if (cardinalIsHorizontal) {
            expected = Math.abs(ly) <= band ? 'h' : 'v';
        } else {
            expected = Math.abs(lx) <= band ? 'v' : 'h';
        }
        return food.orientation === expected;
    }

    // All world-space attachment zones for a creature: the body itself, plus
    // one hotspot at the distant endpoint of each attached line. Each zone
    // reports its outer radius (activation edge, drives spacebar eligibility
    // + start of the proximity ramp) and inner radius (t=1 point, peak of the
    // ramp). Endpoint hotspots span exactly 1 body-radius, from the endpoint
    // (t=1) outward.
    _activationZones(c, pj) {
        const r = c.bodyRadius;
        const zones = [{
            x: c.position.x,
            y: c.position.y,
            outerR: r * pj.effectRadius,
            innerR: r,
        }];
        for (const ln of c.lines) {
            // "Distant" endpoint = whichever end sits farther from local origin
            // (the creature center). Ties → p2, which matches how food-derived
            // lines are stored (p2 is on the +dx side of the center).
            const d1sq = ln.p1.x * ln.p1.x + ln.p1.y * ln.p1.y;
            const d2sq = ln.p2.x * ln.p2.x + ln.p2.y * ln.p2.y;
            const tip = d2sq >= d1sq ? ln.p2 : ln.p1;
            zones.push({
                x: c.position.x + tip.x,
                y: c.position.y + tip.y,
                outerR: r,
                innerR: 0,
            });
        }
        return zones;
    }

    _consume(creature, food) {
        // Attach the food line at its exact current position and orientation
        // relative to the creature — no cardinal-axis snapping.
        const localCx = food.x - creature.position.x;
        const localCy = food.y - creature.position.y;
        const half = food.length / 2;
        const p1 = { x: localCx - food.dx * half, y: localCy - food.dy * half };
        const p2 = { x: localCx + food.dx * half, y: localCy + food.dy * half };
        const line = creature.addLine(p1, p2);
        // Carry the food's stroke weight, penEffect, and jitter profile onto
        // the new creature line so it looks continuous with what was just
        // being rendered as food.
        if (line) {
            line.strokeWeight = food.strokeWeight;
            line.penEffect = PEN_EFFECT;
            line.jitter = food.jitter;
            line.segments = food.segments;
        }
        // Creature reacts to the new limb: blink + a short lateral shake.
        if (creature.reactToAttach) creature.reactToAttach();
        // Fire the juice event so anything enabled in the juice editor
        // (shake / particles / timeSlow) triggers on attach. The particle
        // effector reads .position and .velocity off the trigger; creatures
        // don't carry a velocity, so we pass a wrapper.
        const jem = this.gameSession.juiceEventManager;
        if (jem) {
            jem.addNew('line attaches', {
                position: { x: creature.position.x, y: creature.position.y },
                velocity: { x: 0, y: 0 },
            });
        }
    }

    render() {
        if (!this.enabled || this.items.length === 0) return;
        const p = this.gameSession.p5;
        if (!this._strokeColor) this._strokeColor = p.color(20);
        p.push();
        p.strokeCap(p.ROUND);
        p.strokeJoin(p.ROUND);
        for (const f of this.items) {
            const ln = {
                p1: this._p1(f),
                p2: this._p2(f),
                strokeWeight: f.strokeWeight,
                penEffect: PEN_EFFECT,
                segments: f.segments,
            };
            renderFountainPenLine(p, ln, f.smudge, this._strokeColor, f.jitter, false, NOMINAL_LENGTH);
        }
        p.pop();
    }

    _p1(f) {
        const half = f.length / 2;
        return { x: f.x - f.dx * half, y: f.y - f.dy * half };
    }

    _p2(f) {
        const half = f.length / 2;
        return { x: f.x + f.dx * half, y: f.y + f.dy * half };
    }

    _distanceToSegment(x, y, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001) {
            const ex = x - p1.x; const ey = y - p1.y;
            return Math.sqrt(ex * ex + ey * ey);
        }
        let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = p1.x + t * dx;
        const py = p1.y + t * dy;
        const ex = x - px; const ey = y - py;
        return Math.sqrt(ex * ex + ey * ey);
    }
}
