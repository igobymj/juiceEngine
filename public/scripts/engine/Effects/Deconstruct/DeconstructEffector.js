/*
DeconstructEffector

Splits a VectorGameObject's outline into individual edge segments (facets)
that explode outward, spin, and fade out.

Created 1/30/26 by Claude
*/

export default class DeconstructEffector {

    constructor(gameSession, eventName, triggerObject) {
        this.__gameSession = gameSession;

        const settings = gameSession.juiceSettings.container[eventName].deconstruct;
        this.__duration = settings.duration * 1000; // convert to ms
        this.__fade = settings.fade;
        this.__drag = settings.drag;
        this.__startTime = gameSession.timeManager.time;

        // Extract facets from the trigger object's vertices
        this.__facets = [];

        const vertices = triggerObject.vertices; // cloned array of p5.Vectors (local space)
        const pos = triggerObject.position;
        const rot = triggerObject.rotation;
        const scl = triggerObject.scale;
        const p5 = gameSession.p5;

        for (let i = 0; i < vertices.length; i++) {
            const next = (i + 1) % vertices.length;

            // Transform vertices to world space
            const wp1 = this.toWorld(vertices[i], pos, rot, scl, p5);
            const wp2 = this.toWorld(vertices[next], pos, rot, scl, p5);

            // Facet midpoint in world space
            const mx = (wp1.x + wp2.x) / 2;
            const my = (wp1.y + wp2.y) / 2;

            // Re-center endpoints relative to midpoint (for local rendering)
            const lp1 = p5.createVector(wp1.x - mx, wp1.y - my);
            const lp2 = p5.createVector(wp2.x - mx, wp2.y - my);

            // Outward direction: from object center to facet midpoint
            const outward = p5.createVector(mx - pos.x, my - pos.y);
            if (outward.mag() > 0) {
                outward.normalize();
            } else {
                outward.set(Math.random() - 0.5, Math.random() - 0.5).normalize();
            }

            // Add some random variance to the direction
            const variance = 0.3;
            outward.x += (Math.random() - 0.5) * variance;
            outward.y += (Math.random() - 0.5) * variance;
            outward.normalize();

            this.__facets.push({
                p1: lp1,
                p2: lp2,
                x: mx,
                y: my,
                vx: outward.x * settings.speed,
                vy: outward.y * settings.speed,
                rotation: 0,
                rotationSpeed: (Math.random() - 0.5) * settings.rotationSpeed * 2,
                alpha: 255
            });
        }
    }

    toWorld(vertex, pos, rot, scl, p5) {
        // Apply scale, then rotation, then translation
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const sx = vertex.x * scl;
        const sy = vertex.y * scl;
        return p5.createVector(
            sx * cos - sy * sin + pos.x,
            sx * sin + sy * cos + pos.y
        );
    }

    update() {
        const dt = this.__gameSession.timeManager.deltaTime / 1000; // seconds
        const elapsed = this.__gameSession.timeManager.time - this.__startTime;

        for (let i = 0; i < this.__facets.length; i++) {
            const f = this.__facets[i];

            // Move
            f.x += f.vx * dt;
            f.y += f.vy * dt;

            // Drag
            f.vx *= this.__drag;
            f.vy *= this.__drag;

            // Rotate
            f.rotation += f.rotationSpeed * dt;

            // Fade
            if (this.__fade) {
                f.alpha = 255 * (1 - elapsed / this.__duration);
                if (f.alpha < 0) f.alpha = 0;
            }
        }
    }

    render() {
        const p5 = this.__gameSession.p5;

        for (let i = 0; i < this.__facets.length; i++) {
            const f = this.__facets[i];
            if (f.alpha <= 0) continue;

            p5.push();
            p5.translate(f.x, f.y);
            p5.rotate(f.rotation);
            p5.stroke(255, f.alpha);
            p5.strokeWeight(1);
            p5.noFill();
            p5.line(f.p1.x, f.p1.y, f.p2.x, f.p2.y);
            p5.pop();
        }
    }

    finished() {
        const elapsed = this.__gameSession.timeManager.time - this.__startTime;
        if (elapsed > this.__duration) {
            return "deconstruct";
        }
        return false;
    }
}
