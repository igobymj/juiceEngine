/*
 * FoldMenu — a collapsible titled section for editor panels.
 *
 * Appends a foldable block to `parentEl` and exposes `.body`, the element to
 * render content into. Clicking the header toggles it. Several FoldMenus in one
 * panel act as independent (non-hierarchical) accordions.
 *
 * With { save: true } the header carries a save affordance that is hidden until
 * setDirty(true) is called and clicking it runs `onSave`. That keeps save
 * visually integrated in the header and visible only when there's a change.
 */
export default class FoldMenu {
  constructor(parentEl, title, options = {}) {
    const open = options.open !== false;

    const el = document.createElement('div');
    el.className = 'fold' + (open ? ' open' : '');

    const head = document.createElement('button');
    head.className = 'fold-head';
    head.type = 'button';
    head.innerHTML = `<span class="fold-chevron"></span><span class="fold-title">${title}</span>`;

    this.onSave = null;
    this.__save = null;
    if (options.save) {
      const save = document.createElement('span');
      save.className = 'fold-save';
      save.textContent = 'save';
      save.hidden = true;
      // Don't let the save click toggle the fold.
      save.addEventListener('click', (e) => { e.stopPropagation(); if (this.onSave) this.onSave(); });
      head.appendChild(save);
      this.__save = save;
    }

    const body = document.createElement('div');
    body.className = 'fold-body';

    head.addEventListener('click', () => el.classList.toggle('open'));

    el.appendChild(head);
    el.appendChild(body);
    parentEl.appendChild(el);

    this.el = el;
    this.body = body;
  }

  // Show/hide the header save affordance.
  setDirty(dirty) {
    if (this.__save) this.__save.hidden = !dirty;
  }
}
