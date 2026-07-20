/*
 * FoldMenu — a collapsible titled section for editor panels.
 *
 * Appends a foldable block to `parentEl` and exposes `.body`, the element to
 * render content into. Clicking the header toggles it. Several FoldMenus in one
 * panel act as independent (non-hierarchical) accordions — e.g. a "juice" menu
 * and a "sound" menu that fold separately.
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

    const body = document.createElement('div');
    body.className = 'fold-body';

    head.addEventListener('click', () => el.classList.toggle('open'));

    el.appendChild(head);
    el.appendChild(body);
    parentEl.appendChild(el);

    this.el = el;
    this.body = body;
  }
}
