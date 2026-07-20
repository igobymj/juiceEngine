/*
 * JuiceEditor — DOM-based panel for editing per-event juice effect settings.
 *
 * UI: a dropdown of registered events (anything in juiceSettings.container
 * that isn't 'cheats'); when an event is picked the panel lists each known
 * effect with controls for its parameters. Changes write back to the live
 * juiceSettings.container so the next time the event fires the new values
 * apply immediately.
 *
 * Effect controls are driven by EFFECT_SCHEMAS — adding a new control row is
 * just adding a schema entry; the renderer handles bool / range / select /
 * color uniformly.
 */

// Per-effect parameter schemas. Order in `params` is the render order.
// `paramsSource: 'particleSystem'` redirects everything except `active` to
// juiceSettings.particleSystems[<system>].vectorParticle.
// Hue → CSS color. The particle engine treats hue ≤ 0 as "no override"
// (particles stay their default white), so mirror that in the preview.
function _hueToCss(value) {
    const v = +value;
    if (!isFinite(v) || v <= 0) return '#ffffff';
    return `hsl(${v}, 80%, 55%)`;
}

const EFFECT_SCHEMAS = {
    shake: {
        label: 'screen shake',
        params: [
            { key: 'amplitude', type: 'range', min: 0, max: 1, step: 0.01 },
            { key: 'frequency', type: 'range', min: 1, max: 60, step: 1 },
            { key: 'duration', type: 'range', min: 0, max: 1.5, step: 0.05, suffix: 's' },
            { key: 'form', type: 'select', options: ['sine', 'noise', 'simple'] },
            { key: 'fade', type: 'select', options: ['none', 'linear', 'exponential'] },
            { key: 'xAxis', type: 'bool' },
            { key: 'yAxis', type: 'bool' },
        ],
    },
    particles: {
        label: 'particles',
        paramsSource: 'particleSystem',
        params: [
            { key: 'count', type: 'range', min: 1, max: 40, step: 1 },
            { key: 'size', type: 'range', min: 1, max: 24, step: 1 },
            { key: 'initialVelocity', type: 'range', min: 1, max: 100, step: 1 },
            { key: 'particleLife', type: 'range', min: 0.3, max: 4, step: 0.1, suffix: 's' },
            { key: 'shape', type: 'select', options: ['circle', 'square', 'triangle', 'line'] },
            { key: 'pattern', type: 'select', options: ['radial', 'random'] },
            { key: 'color', type: 'color' },
            { key: 'gravity', type: 'bool' },
            { key: 'fill', type: 'bool' },
        ],
    },
    timeSlow: {
        label: 'time slow',
        params: [
            { key: 'scale', type: 'range', min: 0.05, max: 1, step: 0.05 },
            { key: 'duration', type: 'range', min: 0, max: 1, step: 0.05, suffix: 's' },
        ],
    },
    proximityJitter: {
        label: 'proximity jitter',
        params: [
            { key: 'maxJitter', type: 'range', min: 0, max: 4, step: 0.1 },
            { key: 'maxAnimationSpeed', type: 'range', min: 1, max: 30, step: 1, suffix: 'Hz' },
            { key: 'effectRadius', type: 'range', min: 1, max: 5, step: 0.1 },
        ],
    },
    zoneJitter: {
        label: 'zone jitter',
        params: [
            { key: 'amplitude', type: 'range', min: 0, max: 6, step: 0.1 },
            { key: 'interval', type: 'range', min: 30, max: 300, step: 10, suffix: 'ms' },
        ],
    },
    // Assign a sound to an event, just like a visual effect. `clip` options are
    // resolved live from the registered sound names via optionSources.sounds
    // (passed to the editor), so newly-registered clips show up automatically.
    sound: {
        label: 'sound',
        params: [
            { key: 'clip', type: 'select', optionsKey: 'sounds' },
            { key: 'volume', type: 'range', min: -40, max: 6, step: 1, suffix: 'dB' },
            { key: 'rate', type: 'range', min: 0.5, max: 2, step: 0.05 },
        ],
    },
};

export default class JuiceEditor {
    constructor(juiceSettings, panelEl, options = {}) {
        this.juiceSettings = juiceSettings;
        this.panelEl = panelEl;
        // Dynamic select option sources by key, e.g. { sounds: () => [...names] }.
        this.optionSources = options.optionSources || {};
        this.events = this._listEvents();
        this.selectedEvent = this.events[0] ?? null;
        this._render();
    }

    _listEvents() {
        // An "event" is any container key that holds at least one known effect.
        // This excludes config blocks like 'cheats' and 'sillyColors'.
        return Object.keys(this.juiceSettings.container).filter((k) => {
            const v = this.juiceSettings.container[k];
            if (!v || typeof v !== 'object') return false;
            return Object.keys(v).some((eff) => eff in EFFECT_SCHEMAS);
        });
    }

    _render() {
        const events = this.events;
        if (events.length === 0) {
            this.panelEl.innerHTML = `<h2>juice</h2><p class="hint">No events configured.</p>`;
            return;
        }
        const optionsHtml = events
            .map((e) => `<option value="${e}" ${e === this.selectedEvent ? 'selected' : ''}>${e}</option>`)
            .join('');
        // Save only makes sense when the dev server's /api/juice endpoint is
        // reachable. In a static deploy juice.json is committed to the repo
        // and shipped read-only, so hide the button + status row.
        const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const saveHtml = isDev
            ? `<button data-ctrl="save" class="primary">save juice settings</button>
               <div data-region="save-status" class="hint" style="min-height: 1em; margin: -8px 0 12px;"></div>`
            : '';
        this.panelEl.innerHTML = `
            <h2>juice</h2>
            ${saveHtml}
            <label>
                <span class="row" style="display:block; margin-bottom:6px; color:#8a867a;">event</span>
                <select data-ctrl="event">${optionsHtml}</select>
            </label>
            <div data-region="effects"></div>
        `;
        this.panelEl.querySelector('[data-ctrl="event"]').addEventListener('change', (e) => {
            this.selectedEvent = e.target.value;
            this._renderEffects();
        });
        const saveBtn = this.panelEl.querySelector('[data-ctrl="save"]');
        if (saveBtn) saveBtn.addEventListener('click', () => this._save());
        this._renderEffects();
    }

    async _save() {
        const status = this.panelEl.querySelector('[data-region="save-status"]');
        if (status) status.textContent = 'saving…';
        try {
            const res = await fetch('/api/juice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    container: this.juiceSettings.container,
                    particleSystems: this.juiceSettings.particleSystems,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok !== false) {
                if (status) {
                    const ts = new Date().toLocaleTimeString();
                    status.textContent = `saved at ${ts}`;
                }
            } else {
                if (status) status.textContent = `error: ${data.error || res.status}`;
            }
        } catch (e) {
            if (status) status.textContent = `error: ${e.message || e}`;
        }
    }

    _renderEffects() {
        const region = this.panelEl.querySelector('[data-region="effects"]');
        const eventSettings = this.juiceSettings.container[this.selectedEvent] || {};
        // Render every effect that has both a schema and a settings entry.
        const html = Object.entries(EFFECT_SCHEMAS)
            .filter(([effectKey]) => eventSettings[effectKey])
            .map(([effectKey, schema]) => {
                const paramSettings = this._paramSettingsFor(effectKey, schema);
                if (!paramSettings) return '';
                return this._effectHtml(effectKey, schema, eventSettings[effectKey], paramSettings);
            })
            .join('');
        region.innerHTML = html || '<p class="hint">No effects configured for this event.</p>';
        // Wire all controls in this region.
        region.querySelectorAll('[data-effect]').forEach((node) => this._wireParam(node));
    }

    // Where do this effect's non-`active` params live? For most effects, on
    // the event itself; for particles, on the referenced particle system.
    _paramSettingsFor(effectKey, schema) {
        const eventSettings = this.juiceSettings.container[this.selectedEvent] || {};
        const effectSettings = eventSettings[effectKey];
        if (!effectSettings) return null;
        if (schema.paramsSource === 'particleSystem') {
            const systemName = effectSettings.particleSystem;
            const system = this.juiceSettings.particleSystems[systemName];
            return system ? system.vectorParticle : null;
        }
        return effectSettings;
    }

    _effectHtml(effectKey, schema, effectSettings, paramSettings) {
        const head = `
            <div class="effect-head">
                <span class="name">${schema.label}</span>
                <label class="checkbox" style="margin:0;">
                    <input type="checkbox" data-effect="${effectKey}" data-param="active" data-type="bool" ${effectSettings.active ? 'checked' : ''}>
                    active
                </label>
            </div>
        `;
        const body = schema.params.map((p) => this._paramHtml(effectKey, p, paramSettings[p.key])).join('');
        return `<div class="effect">${head}${body}</div>`;
    }

    _paramHtml(effectKey, p, value) {
        const attrs = `data-effect="${effectKey}" data-param="${p.key}" data-type="${p.type}"`;
        switch (p.type) {
            case 'bool':
                return `
                    <label class="checkbox">
                        <input type="checkbox" ${attrs} ${value ? 'checked' : ''}>
                        ${p.key}
                    </label>
                `;
            case 'range': {
                // Optional inline preview (e.g. hue swatch) sits just to the
                // left of the numeric value so it updates with the slider.
                const previewHtml = p.preview === 'hue'
                    ? `<span class="hue-swatch" data-swatch="${effectKey}-${p.key}" style="background: ${_hueToCss(value)};"></span>`
                    : '';
                return `
                    <label class="slider">
                        <span class="row">
                            <span>${p.key}</span>
                            <span class="val" data-val="${effectKey}-${p.key}">${previewHtml}<span data-num="${effectKey}-${p.key}">${this._formatNumber(value, p)}</span></span>
                        </span>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" ${attrs} data-min="${p.min}" data-max="${p.max}" data-step="${p.step}" data-suffix="${p.suffix ?? ''}" data-preview="${p.preview ?? ''}">
                    </label>
                `;
            }
            case 'select': {
                const opts = this._optionsFor(p)
                    .map((o) => `<option value="${o}" ${this._optionMatches(o, value) ? 'selected' : ''}>${o}</option>`)
                    .join('');
                return `
                    <label>
                        <span class="row" style="display:block; margin-bottom:4px;">${p.key}</span>
                        <select ${attrs}>${opts}</select>
                    </label>
                `;
            }
            case 'color':
                return `
                    <label>
                        <span class="row" style="display:block; margin-bottom:4px;">${p.key}</span>
                        <input type="color" value="${value}" ${attrs}>
                    </label>
                `;
        }
        return '';
    }

    // Static `options` on the schema, else a dynamic list resolved from
    // optionSources[optionsKey] (e.g. the live set of registered sound names).
    _optionsFor(p) {
        if (p.options) return p.options;
        if (p.optionsKey && this.optionSources[p.optionsKey]) {
            return this.optionSources[p.optionsKey]() || [];
        }
        return [];
    }

    // 'none' in the schema maps to a falsy value in the settings; treat them
    // as the same selection.
    _optionMatches(opt, val) {
        if (opt === 'none') return val === 'none' || val === false || val === '' || val == null;
        return opt === val;
    }

    _formatNumber(value, p) {
        const step = parseFloat(p.step);
        const digits = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
        const suffix = p.suffix ?? '';
        return `${(+value).toFixed(digits)}${suffix}`;
    }

    _wireParam(node) {
        const effect = node.dataset.effect;
        const param = node.dataset.param;
        const type = node.dataset.type;
        const eventKey = this.selectedEvent;
        const schema = EFFECT_SCHEMAS[effect];
        const isParticleParam = schema?.paramsSource === 'particleSystem' && param !== 'active';
        const apply = (value) => {
            if (isParticleParam) {
                const systemName = this.juiceSettings.container[eventKey][effect].particleSystem;
                this.juiceSettings.updateParticleSystem(systemName, 'vectorParticle', param, value);
            } else {
                this.juiceSettings.updateJuice(eventKey, effect, param, value);
            }
        };
        if (type === 'bool') {
            node.addEventListener('change', (e) => apply(!!e.target.checked));
        } else if (type === 'range') {
            const p = {
                step: node.dataset.step,
                suffix: node.dataset.suffix,
            };
            const numEl = this.panelEl.querySelector(`[data-num="${effect}-${param}"]`);
            const swatchEl = this.panelEl.querySelector(`[data-swatch="${effect}-${param}"]`);
            const preview = node.dataset.preview;
            node.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                apply(v);
                if (numEl) numEl.textContent = this._formatNumber(v, p);
                if (swatchEl && preview === 'hue') swatchEl.style.background = _hueToCss(v);
            });
        } else if (type === 'select') {
            node.addEventListener('change', (e) => apply(e.target.value));
        } else if (type === 'color') {
            node.addEventListener('input', (e) => apply(e.target.value));
        }
    }
}
