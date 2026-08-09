/*
 * RtdEditor — property panel for RTD rhythm objects, in the spirit of the
 * primitives Editor: a header that creates new objects from a chosen prototype,
 * then live-wired controls for the selected object. Controls write straight to
 * the object; the next frame renders the new values.
 *
 * New objects are always copies of a prototype: the header's dropdown lists the
 * objects flagged as prototypes, and "add object" clones the selected one. Each
 * object has a unique name and an "is prototype" checkbox (both in its controls).
 *
 * Subscribes to RtdManager.onSelectionChange and re-renders on selection.
 * `options.soundNames()` supplies the sound dropdown choices.
 */

import { behaviorOptions } from "../game/rtd/behaviors.js";

export default class RtdEditor {
  constructor(rtdManager, panelEl, options = {}) {
    this.manager = rtdManager;
    this.panelEl = panelEl;
    this.onCreate = options.onCreate || null;
    this.onSave = options.onSave || null;   // persists the scene; returns truthy on success
    this.soundNames = options.soundNames || (() => []);

    this._refresh();
    this.manager.onSelectionChange = () => this._refresh();
    this.manager.onObjectsChange = () => this._refresh();   // scene populated / object added or removed
  }

  _refresh() {
    const o = this.manager.selected;
    if (!o) this._renderEmpty();
    else this._renderControls(o);
  }

  _headerHtml() {
    // Save persists to public/scripts/data/rtd.json via the dev server, so it
    // only makes sense on localhost (matches the juice/settings editors).
    const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const saveHtml = (this.onSave && isDev)
      ? `<button data-ctrl="save">save objects</button><div class="hint" data-status></div>`
      : '';

    // New objects are created from a prototype, chosen here. Includes retained
    // templates of deleted prototypes so those types stay selectable.
    const protos = this.manager.prototypeChoices();
    const createHtml = protos.length
      ? `<label>
           <span class="row" style="display:block; margin-bottom:4px;">new object from prototype</span>
           <select data-ctrl="proto">${protos.map((o) => `<option value="${this._esc(o.name)}">${this._esc(o.name)}</option>`).join('')}</select>
         </label>
         <button data-ctrl="create" class="primary">add object</button>`
      : `<p class="hint">No prototypes yet. Mark an object as a prototype to create new objects from it.</p>`;

    return `
      <h2>RTD</h2>
      ${createHtml}
      ${saveHtml}
    `;
  }

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _renderEmpty() {
    this.panelEl.innerHTML = `
      ${this._headerHtml()}
      <p class="hint">Click an object to edit its type.</p>
    `;
    this._wireHeader();
  }

  _renderControls(o) {
    // A leading "none" option lets an object pulse silently. It's selected
    // whenever the object has no sound (or the sentinel 'none').
    const hasSound = o.sound && o.sound !== 'none';
    const soundOpts = `<option value="none" ${hasSound ? '' : 'selected'}>none</option>`
      + this.soundNames()
        .map((n) => `<option value="${n}" ${n === o.sound ? 'selected' : ''}>${n}</option>`)
        .join('');
    // Behaviours (fire-on-downbeat, …) attach from a library, like sounds.
    const curBehavior = o.behavior || 'none';
    const behaviorOpts = behaviorOptions()
      .map((b) => `<option value="${b.value}" ${b.value === curBehavior ? 'selected' : ''}>${this._esc(b.label)}</option>`)
      .join('');
    this.panelEl.innerHTML = `
      ${this._headerHtml()}

      <h3>${this._esc(o.name ?? o.label ?? 'kick-circle')}</h3>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">name</span>
        <input type="text" value="${this._esc(o.name ?? '')}" data-ctrl="name">
      </label>

      <label class="checkbox">
        <input type="checkbox" data-ctrl="isPrototype" ${o.isPrototype ? 'checked' : ''}>
        prototype (template for new objects)
      </label>

      ${this._sizeHtml(o)}

      ${this._timingHtml(o)}

      <label class="slider">
        <span class="row"><span>pulse scale</span><span class="val" data-val="pulseScale">${o.pulseScale.toFixed(2)}×</span></span>
        <input type="range" min="1" max="3" step="0.05" value="${o.pulseScale}" data-ctrl="pulseScale">
      </label>

      <label class="slider">
        <span class="row"><span>relax</span><span class="val" data-val="relax">${o.relax.toFixed(2)}</span></span>
        <input type="range" min="0.02" max="0.5" step="0.01" value="${o.relax}" data-ctrl="relax">
      </label>

      <label class="slider">
        <span class="row"><span>volume</span><span class="val" data-val="volume">${o.volume.toFixed(0)} dB</span></span>
        <input type="range" min="-40" max="6" step="1" value="${o.volume}" data-ctrl="volume">
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">color</span>
        <input type="color" value="${o.color}" data-ctrl="color">
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">sound</span>
        <select data-ctrl="sound">${soundOpts}</select>
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">behavior</span>
        <select data-ctrl="behavior">${behaviorOpts}</select>
      </label>

      <button data-ctrl="delete" class="danger">delete object</button>
    `;
    this._wireHeader();
    this._wireControls(o);
  }

  // A quad gun is a free quadrilateral shaped by dragging its corner handles on the
  // canvas (no size slider); every other kind is sized by radius. The four-measure gun
  // additionally exposes its shell's velocity and area-of-effect radius.
  _sizeHtml(o) {
    if (o.isQuad()) {
      let html = `
        <p class="hint">Drag the corner handles on the canvas to shape it — each corner moves on its own.</p>
        <button data-ctrl="recenter">recenter origin</button>`;
      if (o.kind === 'fourMeasureGun') {
        html += `
          <label class="slider">
            <span class="row"><span>projectile velocity</span><span class="val" data-val="projectileSpeed">${o.projectileSpeed.toFixed(2)}</span></span>
            <input type="range" min="0.1" max="1.5" step="0.05" value="${o.projectileSpeed}" data-ctrl="projectileSpeed">
          </label>
          <label class="slider">
            <span class="row"><span>AOE radius</span><span class="val" data-val="aoeRadius">${o.aoeRadius.toFixed(0)} px</span></span>
            <input type="range" min="20" max="300" step="5" value="${o.aoeRadius}" data-ctrl="aoeRadius">
          </label>`;
      }
      return html;
    }
    const label = o.kind === 'ship' ? 'size' : 'radius';
    return `
      <label class="slider">
        <span class="row"><span>${label}</span><span class="val" data-val="radius">${o.radius.toFixed(0)}</span></span>
        <input type="range" min="10" max="200" step="1" value="${o.radius}" data-ctrl="radius">
      </label>`;
  }

  // The metronome is the master clock, so it shows a tempo; every other object shows
  // its subdivision (a rational multiple of the master beat) plus a phase offset, and
  // locks to the grid the metronome sets.
  _timingHtml(o) {
    if (o.kind === 'metronome') {
      // The metronome's phase manually aligns the whole grid — slide it to lock the
      // pulse to a fixed music track (see RtdManager._publishGrid).
      return `
        <label class="slider">
          <span class="row"><span>master tempo</span><span class="val" data-val="bpm">${o.bpm.toFixed(0)} bpm</span></span>
          <input type="range" min="40" max="240" step="1" value="${o.bpm}" data-ctrl="bpm">
        </label>

        <label class="slider">
          <span class="row"><span>phase align</span><span class="val" data-val="phaseOffset">${(o.phaseOffset ?? 0).toFixed(2)}</span></span>
          <input type="range" min="-0.5" max="0.5" step="0.01" value="${o.phaseOffset ?? 0}" data-ctrl="phaseOffset">
        </label>

        <label>
          <span class="row" style="display:block; margin-bottom:4px;">time signature</span>
          <select data-ctrl="timeSignature">${RtdEditor.TIME_SIGNATURES
            .map((s) => `<option value="${s}" ${s === (o.timeSignature || '4/4') ? 'selected' : ''}>${s}</option>`)
            .join('')}</select>
        </label>

        <label class="checkbox">
          <input type="checkbox" data-ctrl="muted" ${o.muted ? 'checked' : ''}>
          mute (silent beat reference)
        </label>`;
    }
    const cur = o.division ?? 1;
    const divOpts = RtdEditor.DIVISIONS
      .map((d) => `<option value="${d.value}" ${d.value === cur ? 'selected' : ''}>${d.label}</option>`)
      .join('');
    return `
      <label>
        <span class="row" style="display:block; margin-bottom:4px;">subdivision</span>
        <select data-ctrl="division">${divOpts}</select>
      </label>

      <label class="slider">
        <span class="row"><span>phase</span><span class="val" data-val="phaseOffset">${(o.phaseOffset ?? 0).toFixed(2)}</span></span>
        <input type="range" min="-0.5" max="0.5" step="0.01" value="${o.phaseOffset ?? 0}" data-ctrl="phaseOffset">
      </label>`;
  }

  _wireHeader() {
    const sel = this.panelEl.querySelector('[data-ctrl="proto"]');
    const btn = this.panelEl.querySelector('[data-ctrl="create"]');
    if (btn) btn.addEventListener('click', () => {
      const name = sel ? sel.value : null;
      if (name && this.onCreate) this.onCreate(name);
    });
    const save = this.panelEl.querySelector('[data-ctrl="save"]');
    if (save) save.addEventListener('click', () => this._doSave());
  }

  async _doSave() {
    if (!this.onSave) return;
    const status = this.panelEl.querySelector('[data-status]');
    if (status) status.textContent = 'saving…';
    try {
      const ok = await this.onSave();
      if (status) status.textContent = ok ? 'saved at ' + new Date().toLocaleTimeString() : 'save failed';
    } catch (e) {
      if (status) status.textContent = 'error: ' + (e.message || e);
    }
  }

  // Audition an object's current sound when it's picked in the editor. Ignores mute so
  // the choice is always audible as a preview; uses the object's own volume.
  _previewSound(o) {
    if (!o.sound || o.sound === 'none') return;
    const sm = o.gameSession && o.gameSession.soundManager;
    const snd = sm && sm.getSound(o.sound);
    if (snd && typeof snd.play === 'function') {
      snd.play({ volume: o.volume, at: window.Tone ? window.Tone.now() : 0 });
    }
  }

  _wireControls(o) {
    const $ = (sel) => this.panelEl.querySelector(sel);

    // Editing a prototype propagates to its instances each frame
    // (RtdManager.syncInstancesFromPrototypes). Editing an inherited property on an
    // *instance* detaches just that property (a per-instance override), so the edit
    // sticks instead of being overwritten by the prototype — e.g. per-instance volume.
    const override = (key) => { if (!o.isPrototype) (o.overrides || (o.overrides = {}))[key] = true; };

    const slider = (ctrl, key, fmt) => {
      const el = $(`[data-ctrl="${ctrl}"]`);
      if (!el) return;   // control absent for this kind (e.g. tempo shows only on the metronome)
      el.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        o[key] = v;
        override(key);
        const num = $(`[data-val="${ctrl}"]`);
        if (num) num.textContent = fmt(v);
      });
    };
    slider('radius', 'radius', (v) => v.toFixed(0));
    slider('bpm', 'bpm', (v) => `${v.toFixed(0)} bpm`);
    slider('phaseOffset', 'phaseOffset', (v) => v.toFixed(2));
    slider('pulseScale', 'pulseScale', (v) => `${v.toFixed(2)}×`);
    slider('relax', 'relax', (v) => v.toFixed(2));
    slider('volume', 'volume', (v) => `${v.toFixed(0)} dB`);
    slider('projectileSpeed', 'projectileSpeed', (v) => v.toFixed(2));
    slider('aoeRadius', 'aoeRadius', (v) => `${v.toFixed(0)} px`);

    const divSel = $('[data-ctrl="division"]');
    if (divSel) divSel.addEventListener('change', (e) => { o.division = parseFloat(e.target.value); override('division'); });

    const muteEl = $('[data-ctrl="muted"]');
    if (muteEl) muteEl.addEventListener('change', (e) => { o.muted = e.target.checked; override('muted'); });

    const tsSel = $('[data-ctrl="timeSignature"]');
    if (tsSel) tsSel.addEventListener('change', (e) => { o.timeSignature = e.target.value; override('timeSignature'); });

    const recenter = $('[data-ctrl="recenter"]');
    if (recenter) recenter.addEventListener('click', () => { o.recenterVerts(); });

    $('[data-ctrl="color"]').addEventListener('input', (e) => { o.color = e.target.value; override('color'); });
    $('[data-ctrl="sound"]').addEventListener('change', (e) => { o.sound = e.target.value; override('sound'); this._previewSound(o); });
    $('[data-ctrl="behavior"]').addEventListener('change', (e) => { o.behavior = e.target.value; override('behavior'); });
    $('[data-ctrl="delete"]').addEventListener('click', () => this.manager.deleteSelected());

    // Name is kept unique by the manager; re-render so the field reflects any
    // adjustment and the prototype dropdown stays in sync.
    $('[data-ctrl="name"]').addEventListener('change', (e) => {
      this.manager.renameObject(o, e.target.value);
      this._refresh();
    });
    // Toggling prototype status changes what the create dropdown offers, and
    // adds/strips the "p_" prototype-name prefix so the namespaces stay separate.
    $('[data-ctrl="isPrototype"]').addEventListener('change', (e) => {
      o.isPrototype = e.target.checked;
      this.manager.renameObject(o, o.name);
      this._refresh();
    });
  }
}

// Time signatures offered for the metronome. Only the numerator (beats per bar) is
// used today, so 4/4 and 3/4 differ by bar length; extend as needed.
RtdEditor.TIME_SIGNATURES = ['4/4', '3/4'];

// Subdivision choices offered for non-metronome objects: pulses per master beat.
RtdEditor.DIVISIONS = [
  { value: 4,    label: '4× — sixteenths' },
  { value: 3,    label: '3× — triplets' },
  { value: 2,    label: '2× — eighths' },
  { value: 1,    label: '1× — on the beat' },
  { value: 0.5,  label: '÷2 — every 2 beats' },
  { value: 0.25, label: '÷4 — every 4 beats' },
];
