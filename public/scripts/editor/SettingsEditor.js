/*
 * SettingsEditor — a live control panel for any settings object.
 *
 * Generalises the juice editor's schema→UI idea beyond juice: give it sections,
 * each bound to a target object and a list of params, and it renders bool /
 * range / select / color controls that write straight back to that object.
 * Optionally shows a Save button that POSTs the state to /api/config/<name>,
 * which the dev server writes to public/scripts/data/<name>.json.
 *
 *   new SettingsEditor(panelEl, {
 *     title: 'Demo',
 *     sections: [{
 *       title: 'Target',
 *       target: demoParams,
 *       params: [
 *         { key: 'radius', type: 'range', min: 20, max: 120, step: 1 },
 *         { key: 'hue',    type: 'range', min: 0, max: 360, step: 1 },
 *         { key: 'filled', type: 'bool' },
 *       ],
 *     }],
 *     save: { name: 'demo', getState: () => demoParams },   // optional
 *   });
 */
export default class SettingsEditor {
  constructor(panelEl, config = {}) {
    this.panelEl = panelEl;
    this.title = config.title || 'Settings';
    this.sections = config.sections || [];
    this.save = config.save || null;   // { name, getState }
    this._render();
  }

  _render() {
    this.panelEl.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = this.title;
    this.panelEl.appendChild(h);

    // Save only makes sense against the dev server.
    const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (this.save && isDev) {
      const btn = document.createElement('button');
      btn.textContent = 'save ' + this.title.toLowerCase();
      this._status = document.createElement('div');
      this._status.className = 'hint';
      btn.addEventListener('click', () => this._doSave());
      this.panelEl.appendChild(btn);
      this.panelEl.appendChild(this._status);
    }

    for (const sec of this.sections) this.panelEl.appendChild(this._sectionEl(sec));
  }

  _sectionEl(sec) {
    const wrap = document.createElement('div');
    wrap.className = 'section';
    if (sec.title) {
      const h3 = document.createElement('h3');
      h3.textContent = sec.title;
      wrap.appendChild(h3);
    }
    for (const p of sec.params) wrap.appendChild(this._paramEl(sec.target, p));
    return wrap;
  }

  _fmt(v, step) {
    const s = parseFloat(step) || 1;
    const digits = s >= 1 ? 0 : (s >= 0.1 ? 1 : 2);
    return (+v).toFixed(digits);
  }

  _paramEl(target, p) {
    const val = target[p.key];
    const label = document.createElement('label');

    if (p.type === 'bool') {
      label.className = 'checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!val;
      input.addEventListener('change', () => { target[p.key] = input.checked; });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + (p.label || p.key)));
      return label;
    }

    if (p.type === 'range') {
      label.className = 'slider';
      const row = document.createElement('span');
      row.className = 'row';
      const name = document.createElement('span'); name.textContent = p.label || p.key;
      const valEl = document.createElement('span'); valEl.className = 'val';
      valEl.textContent = this._fmt(val, p.step) + (p.suffix || '');
      row.appendChild(name); row.appendChild(valEl);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = p.min; input.max = p.max; input.step = p.step ?? 1; input.value = val;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        target[p.key] = v;
        valEl.textContent = this._fmt(v, p.step) + (p.suffix || '');
      });
      label.appendChild(row);
      label.appendChild(input);
      return label;
    }

    if (p.type === 'select') {
      const name = document.createElement('span');
      name.className = 'row'; name.style.display = 'block'; name.style.marginBottom = '4px';
      name.textContent = p.label || p.key;
      const select = document.createElement('select');
      for (const opt of p.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt; o.selected = opt === val;
        select.appendChild(o);
      }
      select.addEventListener('change', () => { target[p.key] = select.value; });
      label.appendChild(name);
      label.appendChild(select);
      return label;
    }

    if (p.type === 'color') {
      const name = document.createElement('span');
      name.className = 'row'; name.style.display = 'block'; name.style.marginBottom = '4px';
      name.textContent = p.label || p.key;
      const input = document.createElement('input');
      input.type = 'color'; input.value = val;
      input.addEventListener('input', () => { target[p.key] = input.value; });
      label.appendChild(name);
      label.appendChild(input);
      return label;
    }

    return label;
  }

  async _doSave() {
    if (!this.save) return;
    const state = this.save.getState ? this.save.getState() : {};
    if (this._status) this._status.textContent = 'saving…';
    try {
      const res = await fetch('/api/config/' + encodeURIComponent(this.save.name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      const data = await res.json().catch(() => ({}));
      if (this._status) {
        this._status.textContent = (res.ok && data.ok !== false)
          ? 'saved at ' + new Date().toLocaleTimeString()
          : 'error: ' + (data.error || res.status);
      }
    } catch (e) {
      if (this._status) this._status.textContent = 'error: ' + (e.message || e);
    }
  }
}
