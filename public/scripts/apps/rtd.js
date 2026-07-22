/*
 * RTD — a rhythm game, built as a juiceEngine app.
 *
 * A pulse object (the "kick-circle") sits on the canvas and pulses on the beat,
 * playing its sound at the moment of each pulse. RtdManager owns the objects;
 * RtdEditor (mounted in onActivate) edits the selected object's type the way
 * the primitives editor edits a creature. New voices come from toneSynths.
 */

import RtdManager from "../game/rtd/RtdManager.js";
import { registerToneSynths } from "../engine/sounds/toneSynths.js";

let savedJuice = null;   // reserved for future juice persistence
export function setSavedJuice(data) { savedJuice = data; }

export default {
  id: 'rtd',
  title: 'RTD',
  background: '#141018',

  build(gs) {
    // The kick voice from the toneSynths library (played on each pulse).
    registerToneSynths(gs, ['kick']);

    const rtd = new RtdManager(gs);
    gs.registerManager('rtdManager', rtd);
    gs.gameLoop.addUpdateSystem('rtd', rtd, 50);
    gs.gameLoop.addRenderSystem('rtd', rtd, 50);

    // Click selects an object to edit (empty space deselects).
    gs.inputManager.addMouseHandler({ mousePressed: (x, y) => rtd.mousePressed(x, y) });

    // Start with one kick-circle at centre, pulsing at 100bpm.
    rtd.createObject({
      x: gs.canvasWidth / 2,
      y: gs.canvasHeight / 2,
      bpm: 100,
      sound: 'kick',
    });
  },
};
