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

export default class RtdEditor {
  constructor(rtdManager, panelEl, options = {}) {
    this.manager = rtdManager;
    this.panelEl = panelEl;
    this.onCreate = options.onCreate || null;
    this.onSave = options.onSave || null;   // persists the scene; returns truthy on success
    this.onDone = options.onDone || null;   // in-place edit: SAVE persists and returns to caller
    this.soundNames = options.soundNames || (() => []);

    this._refresh();
    this.manager.onSelectionChange = () => this._refresh();
    this.manager.onObjectsChange = () => this._refresh();   // scene populated / object added or removed
  }

  // Change an object's type via the dropdown. convertType enforces the one-metronome-per-scene
  // rule by throwing; catch it, surface the message, and re-render (which resets the dropdown to
  // the object's unchanged type).
  _convertType(o, value) {
    try { this.manager.convertType(o, value); }
    catch (err) { window.alert(err && err.message ? err.message : String(err)); }
    this._refresh();
  }

  _refresh() {
    const o = this.manager.selected;
    // In the in-place edit context, losing the selection (deselect on empty canvas, or the
    // edited object deleted) exits back to the scene editor rather than showing an empty panel.
    if (!o) { if (this.onDone) this.onDone(); else this._renderEmpty(); return; }
    this._renderControls(o);
  }

  _headerHtml() {
    // In-place edit context (opened via the scene editor's EDIT OBJECT): a focused header —
    // SAVE persists the scene and returns to the scene editor (see _doSaveAndReturn). No
    // create-from-prototype control here; you're editing one object, not adding new ones.
    if (this.onDone) {
      return `
        <h2>Edit object</h2>
        <button data-ctrl="done" class="primary">save</button>
        <div class="hint" data-status></div>
      `;
    }
    // OBJECTS mode is the prototype library: click a prototype to edit it. Objects are
    // instantiated in scenes (editor mode's "add instance"), not here — so there's no
    // create control. New prototypes come from checking PROTOTYPE on a scene object.
    // Save persists to public/scripts/data/rtd.json via the dev server, so it only makes
    // sense on localhost (matches the juice/settings editors).
    const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const saveHtml = (this.onSave && isDev)
      ? `<button data-ctrl="save">save objects</button><div class="hint" data-status></div>`
      : '';

    return `
      <h2>Rhythm Space</h2>
      <p class="hint">Object prototypes — click one to edit. Instances are placed in scenes (editor mode).</p>
      <button data-ctrl="new-proto" class="primary">new prototype</button>
      ${saveHtml}
    `;
  }

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Mute toggle — every object has one. It's an AUTHORING aid: the `muted` flag silences the
  // object in editor/objects mode only (it keeps pulsing/animating). Real game play ignores
  // mute — quiet an object there with its volume. Especially handy on the metronome, the
  // master clock you usually want silent while editing. Wired by the `muted` handlers in
  // _wireControls / _wireProjectile.
  _muteHtml(o) {
    const hint = o.kind === 'metronome' ? ' — silent beat reference' : '';
    return `
      <label class="checkbox">
        <input type="checkbox" data-ctrl="muted" ${o.muted ? 'checked' : ''}>
        mute in editor${hint}
      </label>`;
  }

  _renderEmpty() {
    this.panelEl.innerHTML = `
      ${this._headerHtml()}
      <p class="hint">Click an object to edit its type.</p>
    `;
    this._wireHeader();
  }

  _renderControls(o) {
    if (o.kind === 'projectile') return this._renderProjectile(o);
    if (o.kind === 'obstacle') return this._renderObstacle(o);
    // A leading "none" option lets an object pulse silently. It's selected
    // whenever the object has no sound (or the sentinel 'none').
    const hasSound = o.sound && o.sound !== 'none';
    const soundOpts = `<option value="none" ${hasSound ? '' : 'selected'}>none</option>`
      + this.soundNames()
        .map((n) => `<option value="${n}" ${n === o.sound ? 'selected' : ''}>${n}</option>`)
        .join('');
    // Type: the object's high-level role (converts kind on change). A legacy/deprecated
    // value (e.g. 'drum') is shown selected but the offered list is the current taxonomy.
    const curType = o.type || 'launcher';
    const typeList = RtdEditor.TYPES.includes(curType) ? RtdEditor.TYPES : [curType, ...RtdEditor.TYPES];
    const typeOpts = typeList
      .map((t) => `<option value="${t}" ${t === curType ? 'selected' : ''}>${t}</option>`).join('');
    this.panelEl.innerHTML = `
      ${this._headerHtml()}

      <h3>${this._esc(o.name ?? o.label ?? 'kick-circle')}</h3>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">name</span>
        <input type="text" value="${this._esc(o.name ?? '')}" data-ctrl="name">
      </label>

      <label>
        <span class="row" style="display:block; margin-bottom:4px;">type</span>
        <select data-ctrl="type">${typeOpts}</select>
      </label>

      <label class="checkbox">
        <input type="checkbox" data-ctrl="isPrototype" ${o.isPrototype ? 'checked' : ''}>
        prototype (template for new objects)
      </label>

      <label class="checkbox">
        <input type="checkbox" data-ctrl="spawnAtLaunch" ${o.spawnAtLaunch ? 'checked' : ''} ${o.isPrototype ? 'disabled' : ''}>
        spawn at launch (game mode only)
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
      <button data-ctrl="preview-pulse" class="preview-btn">▶ preview pulse</button>

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

      ${this._muteHtml(o)}

      <button data-ctrl="delete" class="danger">delete object</button>
    `;
    this._wireHeader();
    this._wireControls(o);
  }

  // A projectile definition (kind 'projectile') — a template a launcher fires. Appearance
  // borrows the particle system (shape / fill / size / color); plus behaviour (speed,
  // explode-on-impact + AOE radius, lifetime) and animation (rotation spin, beat-pulse).
  _renderProjectile(o) {
    const shapeOpts = RtdEditor.PROJECTILE_SHAPES
      .map((s) => `<option value="${s}" ${s === (o.shape || 'circle') ? 'selected' : ''}>${s}</option>`).join('');
    const curType = o.type || 'projectile';
    const typeList = RtdEditor.TYPES.includes(curType) ? RtdEditor.TYPES : [curType, ...RtdEditor.TYPES];
    const typeOpts = typeList.map((t) => `<option value="${t}" ${t === curType ? 'selected' : ''}>${t}</option>`).join('');
    this.panelEl.innerHTML = `
      ${this._headerHtml()}
      <h3>${this._esc(o.name ?? 'projectile')}</h3>
      <label><span class="row" style="display:block; margin-bottom:4px;">name</span>
        <input type="text" value="${this._esc(o.name ?? '')}" data-ctrl="name"></label>
      <label><span class="row" style="display:block; margin-bottom:4px;">type</span>
        <select data-ctrl="type">${typeOpts}</select></label>
      <label class="checkbox"><input type="checkbox" data-ctrl="isPrototype" ${o.isPrototype ? 'checked' : ''}> prototype (template for new objects)</label>

      <label><span class="row" style="display:block; margin-bottom:4px;">shape</span>
        <select data-ctrl="shape">${shapeOpts}</select></label>
      <label class="checkbox"><input type="checkbox" data-ctrl="fill" ${o.fill ? 'checked' : ''}> fill (else outline)</label>
      <label class="slider"><span class="row"><span>size</span><span class="val" data-val="size">${o.size.toFixed(0)} px</span></span>
        <input type="range" min="2" max="60" step="1" value="${o.size}" data-ctrl="size"></label>
      <label><span class="row" style="display:block; margin-bottom:4px;">color</span>
        <input type="color" value="${o.color}" data-ctrl="color"></label>

      <label class="slider"><span class="row"><span>speed</span><span class="val" data-val="speed">${o.speed.toFixed(2)}</span></span>
        <input type="range" min="0.1" max="2" step="0.05" value="${o.speed}" data-ctrl="speed"></label>
      <label class="checkbox"><input type="checkbox" data-ctrl="explodes" ${o.explodes ? 'checked' : ''}> explodes (area of effect)</label>
      <label class="slider"><span class="row"><span>AOE radius</span><span class="val" data-val="aoeRadius">${o.aoeRadius.toFixed(0)} px</span></span>
        <input type="range" min="20" max="300" step="5" value="${o.aoeRadius}" data-ctrl="aoeRadius"></label>
      <label class="slider"><span class="row"><span>lifetime</span><span class="val" data-val="lifetime">${o.lifetime.toFixed(0)} ms</span></span>
        <input type="range" min="200" max="5000" step="100" value="${o.lifetime}" data-ctrl="lifetime"></label>

      <label class="slider"><span class="row"><span>rotation</span><span class="val" data-val="spinSpeed">${o.spinSpeed.toFixed(3)}</span></span>
        <input type="range" min="-0.02" max="0.02" step="0.001" value="${o.spinSpeed}" data-ctrl="spinSpeed"></label>
      <label class="slider"><span class="row"><span>beatpulse</span><span class="val" data-val="beatpulse">${o.beatpulse.toFixed(2)}</span></span>
        <input type="range" min="0" max="1" step="0.05" value="${o.beatpulse}" data-ctrl="beatpulse"></label>
      <button data-ctrl="preview-projectile" class="preview-btn">▶ preview motion</button>

      ${this._muteHtml(o)}

      <button data-ctrl="delete" class="danger">delete object</button>
    `;
    this._wireHeader();
    this._wireProjectile(o);
  }

  _wireProjectile(o) {
    const $ = (sel) => this.panelEl.querySelector(sel);
    const override = (key) => { if (!o.isPrototype) (o.overrides || (o.overrides = {}))[key] = true; };
    const slider = (ctrl, key, fmt) => {
      const el = $(`[data-ctrl="${ctrl}"]`);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value); o[key] = v; override(key);
        const n = $(`[data-val="${ctrl}"]`); if (n) n.textContent = fmt(v);
      });
    };
    slider('size', 'size', (v) => `${v.toFixed(0)} px`);
    slider('speed', 'speed', (v) => v.toFixed(2));
    slider('aoeRadius', 'aoeRadius', (v) => `${v.toFixed(0)} px`);
    slider('lifetime', 'lifetime', (v) => `${v.toFixed(0)} ms`);
    slider('spinSpeed', 'spinSpeed', (v) => v.toFixed(3));
    slider('beatpulse', 'beatpulse', (v) => v.toFixed(2));
    // Fire a sample projectile to preview the effect when rotation (spinSpeed), speed or
    // lifetime is changed — on release ('change'), so dragging a slider doesn't spam previews.
    ['spinSpeed', 'speed', 'lifetime'].forEach((ctrl) => {
      const el = $(`[data-ctrl="${ctrl}"]`);
      if (el) el.addEventListener('change', () => this.manager.previewProjectile(o));
    });
    $('[data-ctrl="type"]').addEventListener('change', (e) => this._convertType(o, e.target.value));
    $('[data-ctrl="shape"]').addEventListener('change', (e) => { o.shape = e.target.value; override('shape'); });
    $('[data-ctrl="fill"]').addEventListener('change', (e) => { o.fill = e.target.checked; override('fill'); });
    $('[data-ctrl="explodes"]').addEventListener('change', (e) => { o.explodes = e.target.checked; override('explodes'); });
    $('[data-ctrl="color"]').addEventListener('input', (e) => { o.color = e.target.value; override('color'); });
    const muteEl = $('[data-ctrl="muted"]');
    if (muteEl) muteEl.addEventListener('change', (e) => { o.muted = e.target.checked; override('muted'); });
    $('[data-ctrl="preview-projectile"]').addEventListener('click', () => this.manager.previewProjectile(o));
    $('[data-ctrl="delete"]').addEventListener('click', () => this.manager.deleteSelected());
    $('[data-ctrl="name"]').addEventListener('change', (e) => { this.manager.renameObject(o, e.target.value); this._refresh(); });
    $('[data-ctrl="isPrototype"]').addEventListener('change', (e) => { this.manager.setPrototype(o, e.target.checked); this._refresh(); });
  }

  // An obstacle definition (kind 'obstacle') — an authorable asteroid. The AsteroidManager
  // spawns drifting rocks from it. Appearance is size (scale) + color; motion is drift speed +
  // spin; and on destruction it spawns the chosen obstacle prototype at a probability.
  _renderObstacle(o) {
    const curType = o.type || 'obstacle';
    const typeList = RtdEditor.TYPES.includes(curType) ? RtdEditor.TYPES : [curType, ...RtdEditor.TYPES];
    const typeOpts = typeList.map((t) => `<option value="${t}" ${t === curType ? 'selected' : ''}>${t}</option>`).join('');
    // Spawn target: any obstacle prototype (by bare name), or 'none'.
    const names = ['none', ...this.manager.obstaclePrototypes().map((p) => p.name.replace(/^p_/, ''))];
    const spawnOpts = names.map((n) => `<option value="${n}" ${n === (o.spawns || 'none') ? 'selected' : ''}>${this._esc(n)}</option>`).join('');
    // Pulse subdivision — how many times per master beat the rock throbs (as on the ship).
    const divOpts = RtdEditor.DIVISIONS
      .map((d) => `<option value="${d.value}" ${d.value === (o.division ?? 1) ? 'selected' : ''}>${d.label}</option>`).join('');
    this.panelEl.innerHTML = `
      ${this._headerHtml()}
      <h3>${this._esc(o.name ?? 'obstacle')}</h3>
      <label><span class="row" style="display:block; margin-bottom:4px;">name</span>
        <input type="text" value="${this._esc(o.name ?? '')}" data-ctrl="name"></label>
      <label><span class="row" style="display:block; margin-bottom:4px;">type</span>
        <select data-ctrl="type">${typeOpts}</select></label>
      <label class="checkbox"><input type="checkbox" data-ctrl="isPrototype" ${o.isPrototype ? 'checked' : ''}> prototype (template for new objects)</label>

      <label><span class="row" style="display:block; margin-bottom:4px;">color</span>
        <input type="color" value="${o.color}" data-ctrl="color"></label>
      <label class="slider"><span class="row"><span>size</span><span class="val" data-val="size">${o.size.toFixed(0)} px</span></span>
        <input type="range" min="10" max="120" step="1" value="${o.size}" data-ctrl="size"></label>
      <p class="hint" style="margin:10px 0 0;">drift speed — random per rock, in this range</p>
      <label class="slider"><span class="row"><span>drift min</span><span class="val" data-val="driftMin">${o.driftMin.toFixed(2)}</span></span>
        <input type="range" min="0" max="5" step="0.1" value="${o.driftMin}" data-ctrl="driftMin"></label>
      <label class="slider"><span class="row"><span>drift max</span><span class="val" data-val="driftMax">${o.driftMax.toFixed(2)}</span></span>
        <input type="range" min="0" max="5" step="0.1" value="${o.driftMax}" data-ctrl="driftMax"></label>
      <p class="hint" style="margin:10px 0 0;">tumble spin — random magnitude per rock, in this range</p>
      <label class="slider"><span class="row"><span>spin min</span><span class="val" data-val="spinMin">${o.spinMin.toFixed(3)}</span></span>
        <input type="range" min="0" max="0.05" step="0.001" value="${o.spinMin}" data-ctrl="spinMin"></label>
      <label class="slider"><span class="row"><span>spin max</span><span class="val" data-val="spinMax">${o.spinMax.toFixed(3)}</span></span>
        <input type="range" min="0" max="0.05" step="0.001" value="${o.spinMax}" data-ctrl="spinMax"></label>
      <label><span class="row" style="display:block; margin-bottom:4px;">pulse subdivision</span>
        <select data-ctrl="division">${divOpts}</select></label>
      <label class="slider"><span class="row"><span>pulse scale</span><span class="val" data-val="pulseScale">${o.pulseScale.toFixed(2)}×</span></span>
        <input type="range" min="1" max="3" step="0.05" value="${o.pulseScale}" data-ctrl="pulseScale"></label>
      <label class="slider"><span class="row"><span>relax</span><span class="val" data-val="relax">${o.relax.toFixed(2)}</span></span>
        <input type="range" min="0.02" max="0.5" step="0.01" value="${o.relax}" data-ctrl="relax"></label>
      <button data-ctrl="preview-obstacle" class="preview-btn">▶ preview rock (drift · spin · pulse)</button>

      <label><span class="row" style="display:block; margin-bottom:4px;">spawns on destroy</span>
        <select data-ctrl="spawns">${spawnOpts}</select></label>
      <label class="slider"><span class="row"><span>spawn probability</span><span class="val" data-val="spawnProbability">${Math.round(o.spawnProbability * 100)}%</span></span>
        <input type="range" min="0" max="1" step="0.05" value="${o.spawnProbability}" data-ctrl="spawnProbability"></label>
      <button data-ctrl="preview-spawn" class="preview-btn"${o.spawns === 'none' ? ' disabled' : ''}>▶ preview spawn</button>

      <button data-ctrl="delete" class="danger">delete object</button>
    `;
    this._wireHeader();
    this._wireObstacle(o);
  }

  _wireObstacle(o) {
    const $ = (sel) => this.panelEl.querySelector(sel);
    const override = (key) => { if (!o.isPrototype) (o.overrides || (o.overrides = {}))[key] = true; };
    const slider = (ctrl, key, fmt) => {
      const el = $(`[data-ctrl="${ctrl}"]`);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value); o[key] = v; override(key);
        const n = $(`[data-val="${ctrl}"]`); if (n) n.textContent = fmt(v);
      });
    };
    slider('size', 'size', (v) => `${v.toFixed(0)} px`);
    slider('driftMin', 'driftMin', (v) => v.toFixed(2));
    slider('driftMax', 'driftMax', (v) => v.toFixed(2));
    slider('spinMin', 'spinMin', (v) => v.toFixed(3));
    slider('spinMax', 'spinMax', (v) => v.toFixed(3));
    slider('pulseScale', 'pulseScale', (v) => `${v.toFixed(2)}×`);
    slider('relax', 'relax', (v) => v.toFixed(2));
    slider('spawnProbability', 'spawnProbability', (v) => `${Math.round(v * 100)}%`);
    $('[data-ctrl="division"]').addEventListener('change', (e) => { o.division = parseFloat(e.target.value); override('division'); });
    $('[data-ctrl="type"]').addEventListener('change', (e) => this._convertType(o, e.target.value));
    $('[data-ctrl="color"]').addEventListener('input', (e) => { o.color = e.target.value; override('color'); });
    $('[data-ctrl="spawns"]').addEventListener('change', (e) => { o.spawns = e.target.value; override('spawns'); this._refresh(); });   // re-render to enable/disable preview spawn
    $('[data-ctrl="preview-obstacle"]').addEventListener('click', () => this.manager.previewObstacle(o));
    $('[data-ctrl="preview-spawn"]').addEventListener('click', () => this.manager.previewSpawn(o));
    $('[data-ctrl="delete"]').addEventListener('click', () => this.manager.deleteSelected());
    $('[data-ctrl="name"]').addEventListener('change', (e) => { this.manager.renameObject(o, e.target.value); this._refresh(); });
    $('[data-ctrl="isPrototype"]').addEventListener('change', (e) => { this.manager.setPrototype(o, e.target.checked); this._refresh(); });
  }

  // A quad launcher is a free quadrilateral shaped by dragging its corner handles on the
  // canvas (no size slider); every other kind is sized by radius. What a launcher fires — and
  // when — lives in the sequencer strip (projectile dropdown + trigger pattern).
  _sizeHtml(o) {
    if (o.isQuad()) {
      const attach = o.attachPoint || 'nose';
      const attachOpts = [['nose', 'nose'], ['left', 'left'], ['right', 'right'], ['either', 'left/right']]
        .map(([v, l]) => `<option value="${v}" ${v === attach ? 'selected' : ''}>${l}</option>`).join('');
      const life = o.lifespanPhrases ?? 4;
      const lifeOpts = RtdEditor.LIFESPANS
        .map((n) => `<option value="${n}" ${n === life ? 'selected' : ''}>${n}</option>`).join('');
      return `
        <p class="hint">Drag the corner handles on the canvas to shape it — each corner moves on its own.</p>
        <button data-ctrl="recenter">recenter origin</button>
        <label>
          <span class="row" style="display:block; margin:8px 0 4px;">attaches to (ship zone)</span>
          <select data-ctrl="attachPoint">${attachOpts}</select>
        </label>
        <label>
          <span class="row" style="display:block; margin:8px 0 4px;">lifespan (phrases — side only; nose is ∞)</span>
          <select data-ctrl="lifespanPhrases">${lifeOpts}</select>
        </label>`;
    }
    const label = o.kind === 'ship' ? 'size' : 'radius';
    return `
      <label class="slider">
        <span class="row"><span>${label}</span><span class="val" data-val="radius">${o.radius.toFixed(0)}</span></span>
        <input type="range" min="10" max="200" step="1" value="${o.radius}" data-ctrl="radius">
      </label>`;
  }

  // The metronome is the master clock, so it shows a tempo; a rhythm object shows its
  // subdivision (a rational multiple of the master beat) plus a phase offset, and locks
  // to the grid the metronome sets. A quad launcher shows neither: the step sequencer owns its
  // timing (eighth-note granular), so subdivision/phase would only be a redundant control.
  _timingHtml(o) {
    if (o.isQuad()) return '';
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
      // onCreate (createFromPrototype) can throw the one-metronome-per-scene rule — surface it.
      try { if (name && this.onCreate) this.onCreate(name); }
      catch (err) { window.alert(err && err.message ? err.message : String(err)); }
    });
    const newProto = this.panelEl.querySelector('[data-ctrl="new-proto"]');
    if (newProto) newProto.addEventListener('click', () => this.manager.createPrototype());   // auto-selects for editing
    const save = this.panelEl.querySelector('[data-ctrl="save"]');
    if (save) save.addEventListener('click', () => this._doSave());
    const done = this.panelEl.querySelector('[data-ctrl="done"]');
    if (done) done.addEventListener('click', () => this._doSaveAndReturn());
  }

  // In-place edit SAVE: persist the scene (best-effort — returns even if it fails or the
  // dev server isn't there), then hand control back to the caller (the scene editor).
  async _doSaveAndReturn() {
    const status = this.panelEl.querySelector('[data-status]');
    if (this.onSave) {
      if (status) status.textContent = 'saving…';
      try { await this.onSave(); } catch (e) { /* return regardless of save outcome */ }
    }
    if (this.onDone) this.onDone();
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

    const divSel = $('[data-ctrl="division"]');
    if (divSel) divSel.addEventListener('change', (e) => { o.division = parseFloat(e.target.value); override('division'); });

    const muteEl = $('[data-ctrl="muted"]');
    if (muteEl) muteEl.addEventListener('change', (e) => { o.muted = e.target.checked; override('muted'); });

    const tsSel = $('[data-ctrl="timeSignature"]');
    if (tsSel) tsSel.addEventListener('change', (e) => { o.timeSignature = e.target.value; override('timeSignature'); });

    const recenter = $('[data-ctrl="recenter"]');
    if (recenter) recenter.addEventListener('click', () => { o.recenterVerts(); });

    const attachSel = $('[data-ctrl="attachPoint"]');
    if (attachSel) attachSel.addEventListener('change', (e) => { o.attachPoint = e.target.value; override('attachPoint'); });

    const lifeSel = $('[data-ctrl="lifespanPhrases"]');
    if (lifeSel) lifeSel.addEventListener('change', (e) => { o.lifespanPhrases = parseInt(e.target.value, 10) || 1; override('lifespanPhrases'); });

    $('[data-ctrl="color"]').addEventListener('input', (e) => { o.color = e.target.value; override('color'); });
    $('[data-ctrl="sound"]').addEventListener('change', (e) => { o.sound = e.target.value; override('sound'); this._previewSound(o); });
    $('[data-ctrl="type"]').addEventListener('change', (e) => this._convertType(o, e.target.value));
    const spawnEl = $('[data-ctrl="spawnAtLaunch"]');
    if (spawnEl) spawnEl.addEventListener('change', (e) => { o.spawnAtLaunch = e.target.checked; override('spawnAtLaunch'); });
    $('[data-ctrl="preview-pulse"]').addEventListener('click', () => this.manager.previewPulse(o));
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
      this.manager.setPrototype(o, e.target.checked);
      this._refresh();
    });
  }
}

// Time signatures offered for the metronome. Only the numerator (beats per bar) is
// used today, so 4/4 and 3/4 differ by bar length; extend as needed.
RtdEditor.TIME_SIGNATURES = ['4/4', '3/4'];

// Projectile shapes, borrowed from the particle system.
RtdEditor.PROJECTILE_SHAPES = ['circle', 'square', 'triangle', 'line'];

// Side-launcher lifespan choices, in the launcher's pattern-phrases.
RtdEditor.LIFESPANS = [1, 2, 4, 8, 16];

// Object types offered in the editor's type dropdown ('drum' is deprecated, not listed).
RtdEditor.TYPES = ['launcher', 'projectile', 'metronome', 'ship', 'target', 'pickup', 'obstacle', 'trigger'];

// Subdivision choices offered for non-metronome objects: pulses per master beat.
RtdEditor.DIVISIONS = [
  { value: 4,    label: '4× — sixteenths' },
  { value: 3,    label: '3× — triplets' },
  { value: 2,    label: '2× — eighths' },
  { value: 1,    label: '1× — on the beat' },
  { value: 0.5,  label: '÷2 — every 2 beats' },
  { value: 0.25, label: '÷4 — every 4 beats' },
];
