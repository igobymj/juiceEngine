/*
 * Behaviors — a small, extensible library of behaviours that can be attached to a
 * PulseObject from the object editor (assigned by name via a dropdown, like sounds).
 * A behaviour reacts to the object's beat; the object stores its choice in
 * `PulseObject.behavior` and the editor lists these options. Add a behaviour by adding
 * an entry here with a `label` and an `onBeat(obj, gs)` hook.
 */

export const BEHAVIORS = {
  none: { label: 'none' },

  'fire-on-downbeat': {
    label: 'fire on downbeat',
    // Fire a projectile straight up from the object's current position on each beat.
    // Gameplay only — projectiles are driven in game mode — so it no-ops elsewhere,
    // which also stops bullets accumulating while a disabled projectile system can't
    // despawn them.
    onBeat(obj, gs) {
      const rtd = gs.rtdManager;
      if (!rtd || rtd.mode !== 'game') return;
      const proj = gs.rtdProjectiles;
      if (!proj) return;
      const o = obj.worldOrigin();
      proj.fire(gs.p5.createVector(o.x, o.y), -Math.PI / 2);   // heading up (nose direction)
    },
  },
};

// Options for the editor dropdown: [{ value, label }].
export function behaviorOptions() {
  return Object.entries(BEHAVIORS).map(([value, b]) => ({ value, label: b.label }));
}

// Run the object's attached behaviour's onBeat hook, if it has one.
export function runBehaviorOnBeat(obj) {
  const b = BEHAVIORS[obj.behavior];
  if (b && b.onBeat) b.onBeat(obj, obj.gameSession);
}
