/*
 * CreatureManager
 *
 * Holds the live creatures and runs as both an update and render system on
 * the GameLoop. Owns the drag, selection, and line-drawing state.
 *
 * Selection model: mousePressed on a creature both selects it (the editor
 * subscribes to onSelectionChange) and begins a drag. mousePressed in the
 * selected creature's outer ring starts/completes a two-click line. Clicks
 * outside everything deselect.
 */

export default class CreatureManager {
    constructor(gameSession) {
        this.gameSession = gameSession;
        this.creatures = [];
        // 'editor' enables full editing (selection, line drawing, WASD nav).
        // 'play' allows dragging; empty clicks spawn a creature via onSpawnRequest.
        this.mode = 'editor';
        // Optional (x, y) → creature factory invoked on play-mode empty clicks.
        this.onSpawnRequest = null;
        // When false, non-editor clicks don't spawn/kill creatures (garden mode
        // uses clicks for its own ink gesture instead).
        this.clickSpawnEnabled = true;
        this.dragged = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.selected = null;
        // Sub-selection within the selected creature.
        this.selectedLine = null;
        // Fires (no args) when either creature or line selection changes.
        this.onSelectionChange = null;

        // Pending line: { point: {x,y}, axis: 'h'|'v', creature } — in the
        // creature's local space.
        this.pendingLine = null;

        // Endpoint nudge drag: { line, which: 'p1'|'p2', lastMouseX, lastMouseY }
        // Mouse delta is divided by NUDGE_SCALE for precision.
        this.draggedEndpoint = null;
        this.NUDGE_SCALE = 4;
        this.ENDPOINT_HIT_RADIUS = 10;
    }

    // Key dispatch from InputManager. Escape: cancel a pending line first;
    // otherwise deselect the line (creature stays selected).
    keyPressed(key) {
        if (this.mode !== 'editor') return;
        if (key !== 'Escape') return;
        if (this.pendingLine) {
            this.pendingLine = null;
        } else if (this.selectedLine) {
            this.selectLine(null);
        }
    }

    add(creature) {
        this.creatures.push(creature);
        return creature;
    }

    select(creature) {
        if (creature === this.selected) return;
        if (this.selected) {
            this.selected.selected = false;
            this.selected.setSelectedLine(null);
        }
        this.selected = creature;
        this.selectedLine = null;
        if (creature) creature.selected = true;
        // Switching selection cancels any pending line.
        this.pendingLine = null;
        if (this.onSelectionChange) this.onSelectionChange();
    }

    selectLine(line) {
        if (line === this.selectedLine) return;
        this.selectedLine = line;
        if (this.selected) this.selected.setSelectedLine(line);
        if (this.onSelectionChange) this.onSelectionChange();
    }

    mousePressed(x, y) {
        // Play mode: clicking a creature kills it; clicking empty space spawns
        // one (capped at a single creature in the world at a time).
        if (this.mode !== 'editor') {
            if (!this.clickSpawnEnabled) return;
            for (let i = this.creatures.length - 1; i >= 0; i--) {
                const c = this.creatures[i];
                if (c.containsPoint(x, y)) {
                    this.creatures.splice(i, 1);
                    return;
                }
            }
            if (this.creatures.length === 0 && this.onSpawnRequest) {
                this.onSpawnRequest(x, y);
            }
            return;
        }

        // Priority 0: endpoint of the selected line → start a nudge drag.
        if (this.selected && this.selectedLine) {
            const ep = this._endpointAt(x, y);
            if (ep) {
                this.pendingLine = null;
                this.draggedEndpoint = { line: this.selectedLine, which: ep, lastMouseX: x, lastMouseY: y };
                return;
            }
        }

        // Priority 1: inner-ring hit on any creature → select + begin drag.
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const c = this.creatures[i];
            if (c.containsPoint(x, y)) {
                this.pendingLine = null;
                this.select(c);
                this.dragged = c;
                c.grabbed = true;
                this.dragOffsetX = c.position.x - x;
                this.dragOffsetY = c.position.y - y;
                return;
            }
        }

        // Priority 2: hit on an existing line of the selected creature → select it.
        if (this.selected) {
            const localX = x - this.selected.position.x;
            const localY = y - this.selected.position.y;
            const hit = this.selected.lineAtPoint(localX, localY);
            if (hit) {
                this.pendingLine = null;
                this.selectLine(hit);
                return;
            }
        }

        // Priority 3: complete a pending line — second click outside body/line
        // commits the line on the same axis as the first click.
        if (this.pendingLine && this.selected) {
            const localX = x - this.selected.position.x;
            const localY = y - this.selected.position.y;
            const p2 = this._snapToAxis(localX, localY, this.pendingLine.axis, this.pendingLine.lockedValue);
            const newLine = this.selected.addLine(this.pendingLine.point, p2);
            this.pendingLine = null;
            this.selectLine(newLine);
            return;
        }

        // Priority 4: first click in the selected creature's outer ring →
        // start a new line. The quadrant gives the cardinal axis; the click's
        // distance from that axis decides cardinal vs. orthogonal mode.
        if (this.selected && this.selected.containsOuterRing(x, y)) {
            const localX = x - this.selected.position.x;
            const localY = y - this.selected.position.y;
            this.pendingLine = this._startPendingLine(localX, localY, this.selected);
            this.selectLine(null);
            return;
        }

        // Otherwise: deselect.
        this.select(null);
    }

    // Decide the axis + lock for a new line based on the first click's local
    // coords. If the click is within bodyRadius/3 of the cardinal axis of its
    // quadrant, the line snaps to that cardinal axis (lockedValue = 0). If it
    // sits outside that band, the line becomes orthogonal — perpendicular to
    // the cardinal axis, locked at the click's offset from it.
    _startPendingLine(localX, localY, creature) {
        const bandHalfWidth = creature.bodyRadius / 3;
        const cardinalIsHorizontal = Math.abs(localX) >= Math.abs(localY);
        let axis, lockedValue, point;
        if (cardinalIsHorizontal) {
            // Cardinal is the X axis; perpendicular dimension is Y.
            if (Math.abs(localY) <= bandHalfWidth) {
                axis = 'h'; lockedValue = 0;
                point = { x: localX, y: 0 };
            } else {
                // Orthogonal: vertical line at x = localX.
                axis = 'v'; lockedValue = localX;
                point = { x: localX, y: localY };
            }
        } else {
            // Cardinal is the Y axis; perpendicular dimension is X.
            if (Math.abs(localX) <= bandHalfWidth) {
                axis = 'v'; lockedValue = 0;
                point = { x: 0, y: localY };
            } else {
                // Orthogonal: horizontal line at y = localY.
                axis = 'h'; lockedValue = localY;
                point = { x: localX, y: localY };
            }
        }
        return { point, axis, lockedValue, creature };
    }

    deleteSelectedLine() {
        if (this.selected && this.selectedLine) {
            this.selected.removeLine(this.selectedLine);
            this.selectedLine = null;
            if (this.onSelectionChange) this.onSelectionChange();
        }
    }

    mouseDragged(x, y) {
        if (this.draggedEndpoint) {
            const ep = this.draggedEndpoint;
            const dx = (x - ep.lastMouseX) / this.NUDGE_SCALE;
            const dy = (y - ep.lastMouseY) / this.NUDGE_SCALE;
            ep.line[ep.which].x += dx;
            ep.line[ep.which].y += dy;
            ep.lastMouseX = x;
            ep.lastMouseY = y;
            return;
        }
        if (this.dragged) {
            this.dragged.position.x = x + this.dragOffsetX;
            this.dragged.position.y = y + this.dragOffsetY;
        }
    }

    mouseReleased() {
        this.draggedEndpoint = null;
        if (this.dragged) {
            this.dragged.grabbed = false;
            this.dragged = null;
        }
    }

    // Returns 'p1' or 'p2' if (x, y) is within ENDPOINT_HIT_RADIUS of an
    // endpoint of the selected line; null otherwise.
    _endpointAt(x, y) {
        if (!this.selected || !this.selectedLine) return null;
        const c = this.selected;
        const ln = this.selectedLine;
        const tolSq = this.ENDPOINT_HIT_RADIUS * this.ENDPOINT_HIT_RADIUS;
        for (const which of ['p1', 'p2']) {
            const ep = ln[which];
            const dx = x - (c.position.x + ep.x);
            const dy = y - (c.position.y + ep.y);
            if (dx * dx + dy * dy <= tolSq) return which;
        }
        return null;
    }

    // Project (dx, dy) onto a line that varies along `axis` and is locked at
    // `lockedValue` in the perpendicular dimension.
    //   axis='h' → line varies in X, Y is fixed at lockedValue
    //   axis='v' → line varies in Y, X is fixed at lockedValue
    _snapToAxis(dx, dy, axis, lockedValue = 0) {
        return axis === 'h' ? { x: dx, y: lockedValue } : { x: lockedValue, y: dy };
    }

    update() {
        const p = this.gameSession.p5;

        // WASD: in editor mode drives the selected creature; in play mode
        // drives the single creature (play caps the world at one).
        const driven = this.mode === 'editor' ? this.selected : this.creatures[0];
        if (driven) {
            const mv = this.gameSession.inputManager.inputObject.movement;
            if (mv && (mv.x !== 0 || mv.y !== 0)) {
                const speed = 4;
                driven.position.x += mv.x * speed;
                driven.position.y += mv.y * speed;
            }
        }

        const mx = p.mouseX;
        const my = p.mouseY;
        for (const c of this.creatures) {
            c.reachToward(mx, my);
            c.update();
        }
    }

    render() {
        for (const c of this.creatures) c.render();
        if (this.mode === 'editor') this._renderPendingLine();
    }

    _renderPendingLine() {
        if (!this.pendingLine || !this.selected) return;
        const p = this.gameSession.p5;
        const c = this.selected;
        const localX = p.mouseX - c.position.x;
        const localY = p.mouseY - c.position.y;
        const liveEnd = this._snapToAxis(localX, localY, this.pendingLine.axis, this.pendingLine.lockedValue);
        const start = this.pendingLine.point;

        p.push();
        p.translate(c.position.x, c.position.y);

        // Preview line
        p.stroke(60, 130, 200, 200);
        p.strokeWeight(1.5);
        p.line(start.x, start.y, liveEnd.x, liveEnd.y);

        // Anchor dots
        p.noStroke();
        p.fill(60, 130, 200, 230);
        p.circle(start.x, start.y, 6);
        p.fill(60, 130, 200, 150);
        p.circle(liveEnd.x, liveEnd.y, 5);

        p.pop();
    }
}
