/*
 * RhythmSpaceSequencer — a bottom-docked step sequencer for a selected launcher's trigger pattern.
 *
 * Shows an N-measure phrase at a selectable grid resolution (quarter/eighth/sixteenth notes:
 * beatsPerBar * granularity cells per measure).
 * Click cells to toggle where the launcher fires; pick the phrase length and projectile type.
 * A playhead sweeps the phrase in time with the grid. Edits write straight to the object
 * (marking a per-instance override), like the rest of the RTD editor.
 *
 * Runs as a render system: it polls the current selection each frame (so it needs no
 * selection callback of its own), showing only when a quad launcher is selected in a mode
 * where you edit (objects / editor).
 */

export default class RhythmSpaceSequencer {
  constructor(rtdManager, gameSession) {
    this.rtd = rtdManager;
    this.gs = gameSession;
    this._sig = null;   // objectId|measures|stepsPerBar — rebuilt when this changes
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'rtd-sequencer';
    el.innerHTML = `
      <div class="seq-head">
        <span class="seq-title" data-seq="title"></span>
        <label class="seq-ctl">phrase
          <select data-seq="measures">
            <option value="1">1</option><option value="2">2</option>
            <option value="4">4</option><option value="8">8</option>
          </select> measures</label>
        <label class="seq-ctl">grid
          <select data-seq="granularity">
            <option value="1">quarter</option>
            <option value="2">eighth</option>
            <option value="4">sixteenth</option>
          </select></label>
        <label class="seq-ctl">event
          <select data-seq="event">
            <option value="fire">fire</option>
            <option value="pulse">pulse</option>
          </select></label>
        <label class="seq-ctl" data-seq="fires-ctl">fires
          <select data-seq="projectile"></select></label>
        <button class="seq-ctl" data-seq="preview" type="button">▶ preview event</button>
      </div>
      <div class="seq-gridwrap">
        <div class="seq-grid" data-seq="grid"></div>
        <div class="seq-playhead" data-seq="playhead"></div>
      </div>`;
    document.body.appendChild(el);

    this.el = el;
    this.gridEl = el.querySelector('[data-seq="grid"]');
    this.titleEl = el.querySelector('[data-seq="title"]');
    this.playheadEl = el.querySelector('[data-seq="playhead"]');
    this.measuresSel = el.querySelector('[data-seq="measures"]');
    this.granularitySel = el.querySelector('[data-seq="granularity"]');
    this.eventSel = el.querySelector('[data-seq="event"]');
    this.firesCtl = el.querySelector('[data-seq="fires-ctl"]');
    this.projectileSel = el.querySelector('[data-seq="projectile"]');

    this.measuresSel.addEventListener('change', (e) => {
      const o = this._sel();
      if (!o) return;
      o.patternMeasures = parseInt(e.target.value, 10) || 1;
      this._override(o, 'patternMeasures');
      this._sig = null;   // force a grid rebuild
    });
    this.granularitySel.addEventListener('change', (e) => {
      const o = this._sel();
      if (o) { o.granularity = parseInt(e.target.value, 10) || 2; this._override(o, 'granularity'); this._sig = null; }   // rebuild the grid
    });
    this.eventSel.addEventListener('change', (e) => {
      const o = this._sel();
      if (o) { o.event = e.target.value; this._override(o, 'event'); this._sig = null; }   // rebuild to toggle the "fires" control
    });
    el.querySelector('[data-seq="preview"]').addEventListener('click', () => {
      const o = this._sel();
      if (!o) return;
      if ((o.event || 'fire') === 'pulse') this.rtd.previewPulse(o);   // play the event once, in the editor
      else this.rtd.previewLauncherFire(o);
    });
    this.projectileSel.addEventListener('change', (e) => {
      const o = this._sel();
      if (o) { o.projectile = e.target.value; this._override(o, 'projectile'); }
    });
    this.gridEl.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-step]');
      const o = this._sel();
      if (!cell || !o) return;
      const step = parseInt(cell.dataset.step, 10);
      const i = o.patternSteps.indexOf(step);
      if (i >= 0) o.patternSteps.splice(i, 1); else o.patternSteps.push(step);
      this._override(o, 'patternSteps');
      this._refreshActive(o);
    });
  }

  // The sequencer applies to any PULSING object — everything except a projectile definition
  // (a fired template with no beat pulse of its own). A launcher can 'fire' or 'pulse' on the
  // pattern; every other pulsing object uses it to 'pulse'.
  _sel() {
    const o = this.rtd.selected;
    return (o && o.kind !== 'projectile') ? o : null;
  }

  _override(o, key) {
    if (!o.isPrototype) (o.overrides || (o.overrides = {}))[key] = true;
  }

  _gran(o) { return Math.max(1, (o && o.granularity) || 2); }

  _stepsPerBar(o) {
    const g = this.rtd.beatGrid;
    return Math.max(1, (g && g.beatsPerBar) || 4) * this._gran(o);
  }

  render() {
    const o = this._sel();
    const mode = this.rtd.mode;
    const show = !!o && (mode === 'objects' || mode === 'editor');
    this.el.style.display = show ? 'block' : 'none';
    if (!show) { this._sig = null; return; }

    const spb = this._stepsPerBar(o);
    const measures = Math.max(1, o.patternMeasures);
    const sig = o.id + '|' + measures + '|' + spb;   // spb encodes granularity, so a grid change rebuilds
    if (sig !== this._sig) { this._rebuild(o, measures, spb); this._sig = sig; }
    this._refreshActive(o);
    this._updatePlayhead(o, measures, spb);
  }

  _rebuild(o, measures, spb) {
    this.titleEl.textContent = o.name || 'object';
    this.measuresSel.value = String(measures);
    this.granularitySel.value = String(this._gran(o));
    // 'pulse' event throbs the object on the pattern; 'fire' launches a projectile. The
    // projectile picker only applies to 'fire', so hide it when pulsing.
    const event = o.event || 'fire';
    this.eventSel.value = event;
    this.firesCtl.style.display = event === 'pulse' ? 'none' : '';
    this._fillProjectiles(o);
    const gran = this._gran(o);   // a beat is `gran` steps wide
    const phraseLen = measures * spb;
    let html = '';
    for (let s = 0; s < phraseLen; s++) {
      const cls = ['seq-cell'];
      if (s % spb === 0) cls.push('measure-start');
      else if (s % gran === 0) cls.push('beat-start');
      html += `<div class="${cls.join(' ')}" data-step="${s}"></div>`;
    }
    this.gridEl.innerHTML = html;
  }

  // Populate the "fires" dropdown with the scene's projectile prototypes, selecting the
  // launcher's attached one (kept selectable even if the projectile was since deleted).
  _fillProjectiles(o) {
    const bare = (n) => (this.rtd._bareName ? this.rtd._bareName(n) : n);
    const names = (this.rtd.objects || [])
      .filter((p) => p.kind === 'projectile')
      .map((p) => bare(p.name))
      .filter((n, i, a) => n && a.indexOf(n) === i);
    const cur = o.projectile || 'projectile';
    if (cur && !names.includes(cur)) names.unshift(cur);
    this.projectileSel.innerHTML = names.length
      ? names.map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('')
      : `<option value="${cur}" selected>${cur}</option>`;
  }

  _refreshActive(o) {
    const cells = this.gridEl.children;
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('active', o.patternSteps.includes(i));
  }

  _updatePlayhead(o, measures, spb) {
    const g = this.rtd.beatGrid;
    if (!g || !g.masterInterval) return;
    const origin = g.barOrigin != null ? g.barOrigin : g.epoch;
    const phraseLen = measures * spb;
    const stepInterval = g.masterInterval / this._gran(o);
    const raw = (this.gs.timeManager.realTimeSinceStartup - origin) / stepInterval;
    const local = ((raw % phraseLen) + phraseLen) % phraseLen;
    this.playheadEl.style.left = (local / phraseLen * 100) + '%';
  }
}
