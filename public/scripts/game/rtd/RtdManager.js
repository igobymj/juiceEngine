/*
 * RtdManager — owns the RTD rhythm objects (PulseObjects).
 *
 * Mirrors the primitives CreatureManager's role for the editor: it holds the
 * objects, tracks the selected one, and exposes onSelectionChange so the editor
 * can re-render. Registered as an update + render system by the app.
 */

import Manager from "../../engine/Managers/Manager.js";
import PulseObject from "./PulseObject.js";

export default class RtdManager extends Manager {
  constructor(gameSession) {
    super(gameSession);
    this.__objects = [];
    this.selected = null;
    this.onSelectionChange = null;   // editor subscribes
  }

  get objects() { return this.__objects; }

  // Create a new pulse object (a new "type" instance) and select it.
  createObject(opts = {}) {
    const obj = new PulseObject(this.gameSession, opts);
    this.__objects.push(obj);
    this.select(obj);
    return obj;
  }

  select(obj) {
    if (obj === this.selected) return;
    if (this.selected) this.selected.selected = false;
    this.selected = obj;
    if (obj) obj.selected = true;
    if (this.onSelectionChange) this.onSelectionChange();
  }

  deleteSelected() {
    if (!this.selected) return;
    const i = this.__objects.indexOf(this.selected);
    if (i >= 0) this.__objects.splice(i, 1);
    this.selected = null;
    if (this.onSelectionChange) this.onSelectionChange();
  }

  // Click selects the topmost object under the cursor (or deselects).
  mousePressed(x, y) {
    for (let i = this.__objects.length - 1; i >= 0; i--) {
      if (this.__objects[i].contains(x, y)) {
        this.select(this.__objects[i]);
        return;
      }
    }
    this.select(null);
  }

  update() {
    for (const o of this.__objects) o.update();
  }

  render() {
    for (const o of this.__objects) o.render();
  }
}
