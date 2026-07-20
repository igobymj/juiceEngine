/*
 * ExtrasEditor — a native editor panel for non-event ("extras") settings.
 *
 * The juice/sound editors (JuiceEditor) drive per-event effect blocks. Some
 * game settings aren't events at all — music track/volume, silly colors,
 * cheats, toggles. Those live as plain blocks in juiceSettings.container (e.g.
 * container.music, container.sillyColors) and have no EFFECT_SCHEMAS entry.
 *
 * ExtrasEditor renders an app-supplied schema of those blocks using the same
 * control vocabulary (bool / range / select / color) and the same #editor CSS
 * as JuiceEditor, writing straight back into the live container so changes
 * apply immediately. Persistence rides along with the juice save (the whole
 * container is posted), so this editor only reports dirtiness via onChange.
 *
 * Schema shape:
 *   {
 *     <blockName>: {
 *       label: 'music',
 *       params: [
 *         { key: 'track', type: 'select', options: [{value, label}, ...] },
 *         { key: 'volume', type: 'range', min: -40, max: 0, step: 1, suffix: 'dB' },
 *         { key: 'active', type: 'bool' },
 *         { key: 'shipHue', type: 'range', min: 0, max: 360, step: 1, preview: 'hue' },
 *         { key: 'invincibility', type: 'bool', path: 'ship.invincibility' },
 *       ],
 *     },
 *   }
 *
 * `path` (dot-string or array) addresses nested params relative to the block;
 * it defaults to [key]. `options` entries may be plain strings or {value,label}.
 * Dynamic option lists come from optionSources[optionsKey], like JuiceEditor.
 */

function _hueToCss(value) {
    const v = +value;
    if (!isFinite(v) || v <= 0) return '#ffffff';
    return `hsl(${v}, 80%, 55%)`;
}

export default class ExtrasEditor {
    constructor(juiceSettings, panelEl, options = {}) {
        this.juiceSettings = juiceSettings;
        this.panelEl = panelEl;
        this.schema = options.schema || {};
        this.optionSources = options.optionSources || {};
        this.title = options.title || 'extras';
        this.showHeading = options.heading !== false;
        this.onChange = options.onChange || null;   // dirty tracking
        this.onApply = options.onApply || null;      // side effects, (block, param, value, path)
        this._render();
    }

    // Only blocks that actually exist in the container are shown.
    _blocks() {
        return Object.keys(this.schema).filter((b) => this.juiceSettings.container[b]);
    }

    _render() {
        const heading = this.showHeading ? `<h2>${this.title}</h2>` : '';
        const blocks = this._blocks();
        if (blocks.length === 0) {
            this.panelEl.innerHTML = `${heading}<p class="hint">No extras configured.</p>`;
            return;
        }
        const html = blocks.map((b) => this._blockHtml(b, this.schema[b])).join('');
        this.panelEl.innerHTML = `${heading}${html}`;
        this.panelEl.querySelectorAll('[data-block]').forEach((node) => this._wire(node));
    }

    _blockHtml(block, spec) {
        const body = (spec.params || [])
            .map((p) => this._paramHtml(block, p))
            .join('');
        return `
            <div class="effect">
                <div class="effect-head"><span class="name">${spec.label || block}</span></div>
                ${body}
            </div>`;
    }

    _paramHtml(block, p) {
        const value = this._get(block, this._path(p));
        const attrs = `data-block="${block}" data-param="${p.key}" data-path="${this._path(p).join('.')}" data-type="${p.type}"`;
        switch (p.type) {
            case 'bool':
                return `
                    <label class="checkbox">
                        <input type="checkbox" ${attrs} ${value ? 'checked' : ''}>
                        ${p.label || p.key}
                    </label>`;
            case 'range': {
                // Fall back to min for an absent/non-numeric value (no NaN).
                const v = Number.isFinite(+value) ? +value : (Number.isFinite(+p.min) ? +p.min : 0);
                const previewHtml = p.preview === 'hue'
                    ? `<span class="hue-swatch" data-swatch="${block}-${p.key}" style="background: ${_hueToCss(v)};"></span>`
                    : '';
                return `
                    <label class="slider">
                        <span class="row">
                            <span>${p.label || p.key}</span>
                            <span class="val">${previewHtml}<span data-num="${block}-${p.key}">${this._fmt(v, p)}</span></span>
                        </span>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" ${attrs}
                               data-step="${p.step}" data-suffix="${p.suffix ?? ''}" data-preview="${p.preview ?? ''}">
                    </label>`;
            }
            case 'select': {
                const opts = this._optionsFor(p).map((o) => {
                    const ov = (o && typeof o === 'object') ? o.value : o;
                    const ol = (o && typeof o === 'object') ? o.label : o;
                    return `<option value="${ov}" ${ov === value ? 'selected' : ''}>${ol}</option>`;
                }).join('');
                return `
                    <label>
                        <span class="row" style="display:block; margin-bottom:4px;">${p.label || p.key}</span>
                        <select ${attrs}>${opts}</select>
                    </label>`;
            }
            case 'color':
                return `
                    <label>
                        <span class="row" style="display:block; margin-bottom:4px;">${p.label || p.key}</span>
                        <input type="color" value="${value}" ${attrs}>
                    </label>`;
        }
        return '';
    }

    _optionsFor(p) {
        if (p.options) return p.options;
        if (p.optionsKey && this.optionSources[p.optionsKey]) {
            return this.optionSources[p.optionsKey]() || [];
        }
        return [];
    }

    _wire(node) {
        const block = node.dataset.block;
        const param = node.dataset.param;
        const path = node.dataset.path ? node.dataset.path.split('.') : [param];
        const type = node.dataset.type;
        const apply = (value) => {
            this._set(block, path, value);
            if (this.onApply) this.onApply(block, param, value, path);
            if (this.onChange) this.onChange();
        };
        if (type === 'bool') {
            node.addEventListener('change', (e) => apply(!!e.target.checked));
        } else if (type === 'range') {
            const p = { step: node.dataset.step, suffix: node.dataset.suffix };
            const numEl = this.panelEl.querySelector(`[data-num="${block}-${param}"]`);
            const swatchEl = this.panelEl.querySelector(`[data-swatch="${block}-${param}"]`);
            const preview = node.dataset.preview;
            node.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                apply(v);
                if (numEl) numEl.textContent = this._fmt(v, p);
                if (swatchEl && preview === 'hue') swatchEl.style.background = _hueToCss(v);
            });
        } else if (type === 'select') {
            node.addEventListener('change', (e) => apply(e.target.value));
        } else if (type === 'color') {
            node.addEventListener('input', (e) => apply(e.target.value));
        }
    }

    // --- path helpers: read/write container[block] following a nested path ---
    _path(p) {
        if (Array.isArray(p.path)) return p.path;
        if (typeof p.path === 'string') return p.path.split('.');
        return [p.key];
    }

    _get(block, path) {
        let node = this.juiceSettings.container[block];
        for (const seg of path) {
            if (node == null) return undefined;
            node = node[seg];
        }
        return node;
    }

    _set(block, path, value) {
        let node = this.juiceSettings.container[block];
        for (let i = 0; i < path.length - 1; i++) {
            if (node[path[i]] == null || typeof node[path[i]] !== 'object') node[path[i]] = {};
            node = node[path[i]];
        }
        node[path[path.length - 1]] = value;
    }

    _fmt(value, p) {
        const step = parseFloat(p.step);
        const digits = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
        const suffix = p.suffix ?? '';
        return `${(+value).toFixed(digits)}${suffix}`;
    }
}
