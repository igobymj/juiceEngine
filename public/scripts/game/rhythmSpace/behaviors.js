/*
 * Behaviors — a small, extensible library of behaviours that can be attached to a
 * PulseObject from the object editor (assigned by name via a dropdown, like sounds).
 * A behaviour reacts to the object's beat; the object stores its choice in
 * `PulseObject.behavior` and the editor lists these options. Add a behaviour by adding
 * an entry here with a `label` and an `onBeat(obj, gs)` hook.
 */

// Fire the object's attached projectile straight up from its current position, built from
// the referenced projectile definition (resolved by RtdManager). Gameplay only —
// projectiles are driven in game mode — so it no-ops elsewhere, which also stops them
// accumulating while a disabled projectile system can't despawn them. Used by a collected
// launcher (PulseObject._fireLauncher) and the fire-on-downbeat behaviour alike; the launcher's beat-pulse
// amount is passed so the projectile can inherit it (beatpulse).
export function fireProjectile(obj, gs) {
  const rtd = gs.rtdManager;
  if (!rtd || rtd.mode !== 'game') return;
  const proj = gs.rtdProjectiles;
  if (!proj) return;
  const def = rtd.projectileDef(obj.projectile);
  const o = obj.worldOrigin();
  proj.spawn(gs.p5.createVector(o.x, o.y), -Math.PI / 2, { ...def, launcherPulseScale: obj.pulseScale });
  obj.playSoundNow();   // the shot carries the object's selected sound
}

// A behaviour may hook the object's own beat (onBeat, keyed to its subdivision) and/or
// the bar downbeat (onDownbeat, beat 1 of every bar per the metronome's time signature).
export const BEHAVIORS = {
  none: { label: 'none' },
  'fire-on-downbeat': { label: 'fire on downbeat', onDownbeat: fireProjectile },
};

// Options for the editor dropdown: [{ value, label }].
export function behaviorOptions() {
  return Object.entries(BEHAVIORS).map(([value, b]) => ({ value, label: b.label }));
}

// Run the object's attached behaviour's onBeat hook (its own subdivided beat), if any.
export function runBehaviorOnBeat(obj) {
  const b = BEHAVIORS[obj.behavior];
  if (b && b.onBeat) b.onBeat(obj, obj.gameSession);
}

// Run the object's attached behaviour's onDownbeat hook (bar beat 1), if any.
export function runBehaviorOnDownbeat(obj) {
  const b = BEHAVIORS[obj.behavior];
  if (b && b.onDownbeat) b.onDownbeat(obj, obj.gameSession);
}
