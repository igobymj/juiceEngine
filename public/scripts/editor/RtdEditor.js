/*
 * RtdEditor — property panel for RTD rhythm objects, in the spirit of the
 * primitives Editor: a header with a create button, then live-wired controls
 * for the selected object "type" (the kick-circle). Controls write straight to
 * the object; the next frame renders the new values.
 *
 * Subscribes to RtdManager.onSelectionChange and re-renders on selection.
 * `options.soundNames()` supplies the sound dropdown choices.
 */

export default class RtdEditor {
  constructor(rtdManager, panelEl, options = {}) {
    this.manager = rtdManager;
    this.panelEl = panelEl;
    this.onCreate = options.onCreate || null;
    this.soundNames = options.soundNames || (() => []);

    this._refresh();
    this.manager.onSelectionChange = () => this._refresh();
  }

  _refresh() {
    const o = this.manager.selected;
    if (!o) this._renderEmpty();
    else this._renderControls(o);
  }

  _headerHtml() {
    return `
      <h2>RTD</h2>
      <button data-ctrl="create" class="primary">add object type</button>
    `;
  }

  _renderEmpty() {
    this.panelEl.innerHTML = `
      ${this._headerHtml()}
      <p class="hint">Click an object to edit its type.</p>
    `;
    this._wireHeader();
  }

  _renderControls(o) {
    const soundOpts = this.soundNames()
      .map((n) => `<option value="${n}" ${n === o.sound ? 'selected' : ''}>${n}</option>`)
      .join('');
    this.panelEl.innerHTML = `
      ${this._headerHtml()}

      <h3>kick-circle</h3>

      <label class="slider">
        <span class="row"><span>radius</span><span class="val" data-val="radius">${o.radius.toFixed(0)}</span></span>
        <input type="range" min="10" max="200" step="1" value="${o.radius}" data-ctrl="radius">
      </label>

      <label class="slider">
        <span class="row"><span>tempo</span><span class="val" data-val="bpm">${o.bpm.toFixed(0)} bpm</span></span>
        <input type="range" min="40" max="240" step="1" value="${o.bpm}" data-ctrl="bpm">
      </label>

      <label class="slider">
        <span class="row"><span>pulse scale</span><span class="val" data-val="pulseScale">${o.pulseScale.toFixed(2)}×</span></span>
        <input type="range" min="1" max="3" step="0.05" value="${o.pulseScale}" data-ctrl="pulseScale">
      </label>

      <label class="slider">
        <span class="row"><span>relax</span><span class="val" data-val="relax">${o.relax.toFixed(2)}</span></span>
        <input type="range" min="0.02" max="0.5" step="0.01" value="${o.relax}" data-ctrl="relax">
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">color</span>
        <input type="color" value="${o.color}" data-ctrl="color">
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">sound</span>
        <select data-ctrl="sound">${soundOpts || '<option>(none registered)</option>'}</select>
      </label>

      <button data-ctrl="delete" class="danger">delete object</button>
    `;
    this._wireHeader();
    this._wireControls(o);
  }

  _wireHeader() {
    const btn = this.panelEl.querySelector('[data-ctrl="create"]');
    if (btn) btn.addEventListener('click', () => { if (this.onCreate) this.onCreate(); });
  }

  _wireControls(o) {
    const $ = (sel) => this.panelEl.querySelector(sel);

    const slider = (ctrl, key, fmt) => {
      $(`[data-ctrl="${ctrl}"]`).addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        o[key] = v;
        $(`[data-val="${ctrl}"]`).textContent = fmt(v);
      });
    };
    slider('radius', 'radius', (v) => v.toFixed(0));
    slider('bpm', 'bpm', (v) => `${v.toFixed(0)} bpm`);
    slider('pulseScale', 'pulseScale', (v) => `${v.toFixed(2)}×`);
    slider('relax', 'relax', (v) => v.toFixed(2));

    $('[data-ctrl="color"]').addEventListener('input', (e) => { o.color = e.target.value; });
    $('[data-ctrl="sound"]').addEventListener('change', (e) => { o.sound = e.target.value; });
    $('[data-ctrl="delete"]').addEventListener('click', () => this.manager.deleteSelected());
  }
}
