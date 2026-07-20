/*
 * Editor — DOM-based property panel for creature creation and editing.
 *
 * Panel zones:
 *   - Header: title + "create creature" button (always).
 *   - Creature controls: visible when a creature is selected.
 *   - Line controls: visible when a line on the selected creature is selected.
 *
 * Subscribes to CreatureManager.onSelectionChange and re-renders. Controls
 * write directly to the target; the next frame picks up new values.
 */

export default class Editor {
    constructor(creatureManager, panelEl, onCreateCreature) {
        this.creatureManager = creatureManager;
        this.panelEl = panelEl;
        this.onCreateCreature = onCreateCreature;

        this._refresh();
        this.creatureManager.onSelectionChange = () => this._refresh();
    }

    _refresh() {
        const c = this.creatureManager.selected;
        const ln = this.creatureManager.selectedLine;
        if (!c) this._renderEmpty();
        else this._renderControls(c, ln);
    }

    _headerHtml() {
        return `
            <h2>primitives</h2>
            <button data-ctrl="create" class="primary">create creature</button>
        `;
    }

    _renderEmpty() {
        this.panelEl.innerHTML = `
            ${this._headerHtml()}
            <p class="hint">Click a creature to edit.</p>
        `;
        this._wireHeader();
    }

    _renderControls(c, ln) {
        const animOn = c.jitterAnimateInterval > 0;
        const interval = c.jitterAnimateInterval > 0 ? c.jitterAnimateInterval : 120;
        this.panelEl.innerHTML = `
            ${this._headerHtml()}

            <h3>creature</h3>

            <label class="slider">
                <span class="row"><span>body radius</span><span class="val" data-val="body">${c.bodyRadius.toFixed(0)}</span></span>
                <input type="range" min="8" max="80" step="1" value="${c.bodyRadius}" data-ctrl="body">
            </label>

            <label class="slider">
                <span class="row"><span>deformation</span><span class="val" data-val="deformation">${c.deformation.toFixed(2)}</span></span>
                <input type="range" min="0" max="3" step="0.05" value="${c.deformation}" data-ctrl="deformation">
            </label>

            <label class="slider">
                <span class="row"><span>jitter</span><span class="val" data-val="jitter">${c.jitter.toFixed(2)}</span></span>
                <input type="range" min="0" max="3" step="0.05" value="${c.jitter}" data-ctrl="jitter">
            </label>

            <label class="slider">
                <span class="row"><span>stroke weight</span><span class="val" data-val="stroke">${c.strokeWeight.toFixed(1)}</span></span>
                <input type="range" min="0.5" max="6" step="0.1" value="${c.strokeWeight}" data-ctrl="stroke">
            </label>

            <label class="slider">
                <span class="row"><span>pen effect</span><span class="val" data-val="pen">${c.penEffect.toFixed(2)}</span></span>
                <input type="range" min="0" max="5" step="0.05" value="${c.penEffect}" data-ctrl="pen">
            </label>

            <button data-ctrl="reroll">reroll jitter</button>

            <label class="checkbox">
                <input type="checkbox" data-ctrl="animate" ${animOn ? 'checked' : ''}>
                animate jitter
            </label>

            <label class="checkbox">
                <input type="checkbox" data-ctrl="smooth" ${c.smoothJitter ? 'checked' : ''}>
                smooth jitter
            </label>

            <label class="slider">
                <span class="row"><span>interval</span><span class="val" data-val="interval">${interval}ms</span></span>
                <input type="range" min="40" max="500" step="10" value="${interval}" data-ctrl="interval">
            </label>

            ${ln ? this._lineControlsHtml(ln) : '<p class="hint">Click a line to edit it.</p>'}
        `;
        this._wireHeader();
        this._wireCreature(c);
        if (ln) this._wireLine(ln);
    }

    _lineControlsHtml(ln) {
        const pe = ln.penEffect ?? 1.0;
        const jt = ln.jitter ?? 0;
        const seg = ln.segments ?? 6;
        const randSeg = !!ln.randomSegmentLengths;
        return `
            <h3>line</h3>
            <label class="slider">
                <span class="row"><span>stroke weight</span><span class="val" data-val="line-stroke">${ln.strokeWeight.toFixed(1)}</span></span>
                <input type="range" min="0.5" max="8" step="0.1" value="${ln.strokeWeight}" data-ctrl="line-stroke">
            </label>
            <label class="slider">
                <span class="row"><span>pen effect</span><span class="val" data-val="line-pen">${pe.toFixed(2)}</span></span>
                <input type="range" min="0" max="2" step="0.05" value="${pe}" data-ctrl="line-pen">
            </label>
            <label class="slider">
                <span class="row"><span>jitter amplitude</span><span class="val" data-val="line-jitter">${jt.toFixed(2)}</span></span>
                <input type="range" min="0" max="10" step="0.1" value="${jt}" data-ctrl="line-jitter">
            </label>
            <label class="slider">
                <span class="row"><span>jitter frequency</span><span class="val" data-val="line-segments">${seg}</span></span>
                <input type="range" min="4" max="12" step="1" value="${seg}" data-ctrl="line-segments">
            </label>
            <label class="checkbox">
                <input type="checkbox" data-ctrl="line-random-seg" ${randSeg ? 'checked' : ''}>
                random segment length
            </label>
            <button data-ctrl="line-delete" class="danger">delete line</button>
        `;
    }

    _wireHeader() {
        const btn = this.panelEl.querySelector('[data-ctrl="create"]');
        if (btn) btn.addEventListener('click', () => {
            if (this.onCreateCreature) this.onCreateCreature();
        });
    }

    _wireCreature(c) {
        const $ = (sel) => this.panelEl.querySelector(sel);

        $('[data-ctrl="body"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            c.bodyRadius = v;
            $('[data-val="body"]').textContent = v.toFixed(0);
        });

        $('[data-ctrl="deformation"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            c.deformation = v;
            $('[data-val="deformation"]').textContent = v.toFixed(2);
        });

        $('[data-ctrl="jitter"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            c.jitter = v;
            $('[data-val="jitter"]').textContent = v.toFixed(2);
        });

        $('[data-ctrl="stroke"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            c.strokeWeight = v;
            $('[data-val="stroke"]').textContent = v.toFixed(1);
        });

        $('[data-ctrl="pen"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            c.penEffect = v;
            $('[data-val="pen"]').textContent = v.toFixed(2);
        });

        $('[data-ctrl="reroll"]').addEventListener('click', () => c.reroll());

        $('[data-ctrl="animate"]').addEventListener('change', (e) => {
            const interval = parseFloat($('[data-ctrl="interval"]').value);
            c.jitterAnimateInterval = e.target.checked ? interval : 0;
        });

        $('[data-ctrl="smooth"]').addEventListener('change', (e) => {
            c.smoothJitter = e.target.checked;
        });

        $('[data-ctrl="interval"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            $('[data-val="interval"]').textContent = `${v}ms`;
            if ($('[data-ctrl="animate"]').checked) c.jitterAnimateInterval = v;
        });
    }

    _wireLine(ln) {
        const $ = (sel) => this.panelEl.querySelector(sel);

        $('[data-ctrl="line-stroke"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            ln.strokeWeight = v;
            $('[data-val="line-stroke"]').textContent = v.toFixed(1);
        });

        $('[data-ctrl="line-pen"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            ln.penEffect = v;
            $('[data-val="line-pen"]').textContent = v.toFixed(2);
        });

        $('[data-ctrl="line-jitter"]').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            ln.jitter = v;
            $('[data-val="line-jitter"]').textContent = v.toFixed(2);
        });

        $('[data-ctrl="line-segments"]').addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            ln.segments = v;
            $('[data-val="line-segments"]').textContent = String(v);
        });

        $('[data-ctrl="line-random-seg"]').addEventListener('change', (e) => {
            ln.randomSegmentLengths = e.target.checked;
        });

        $('[data-ctrl="line-delete"]').addEventListener('click', () => {
            this.creatureManager.deleteSelectedLine();
        });
    }
}
