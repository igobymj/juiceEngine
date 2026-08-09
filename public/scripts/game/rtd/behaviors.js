/*
 * Behaviors — a small, extensible library of behaviours that can be attached to a
 * PulseObject from the object editor (assigned by name via a dropdown, like sounds).
 * A behaviour reacts to the object's beat; the object stores its choice in
 * `PulseObject.behavior` and the editor lists these options. Add a behaviour by adding
 * an entry here with a `label` and an `onBeat(obj, gs)` hook.
 */

// Fire a projectile straight up from the object's current position. Gameplay only —
// projectiles are driven in game mode — so it no-ops elsewhere, which also stops bullets
// accumulating while a disabled projectile system can't despawn them. Exported so a
// collected downbeat gun can fire directly (see PulseObject._onBeat) as well as via the
// attachable behaviour below.
export function fireOnDownbeat(obj, gs) {
  const rtd = gs.rtdManager;
  if (!rtd || rtd.mode !== 'game') return;
  const proj = gs.rtdProjectiles;
  if (!proj) return;
  const o = obj.worldOrigin();
  // Skip the generic bullet-fire sound: a fire-on-downbeat object carries its own sound
  // (the gun's selected effect below; a non-gun's per-beat sound), so the shot is silent.
  proj.fire(gs.p5.createVector(o.x, o.y), -Math.PI / 2, { event: false });   // heading up
  // A quad gun's shot carries the sound picked in the editor. Scoped to guns so a non-gun
  // object with this behaviour (which still sounds per-beat) doesn't double up.
  if (obj.isQuad && obj.isQuad()) obj.playSoundNow();
}

// Fire a slow, large area-of-effect shell straight up from the object (the four-measure
// gun). The shell explodes on impact or at end of range, destroying asteroids within its
// AOE. Velocity and AOE radius come from the object's editor params. Game mode only.
export function fireAoeShell(obj, gs) {
  const rtd = gs.rtdManager;
  if (!rtd || rtd.mode !== 'game') return;
  const proj = gs.rtdProjectiles;
  if (!proj || typeof proj.fireShell !== 'function') return;
  const o = obj.worldOrigin();
  proj.fireShell(gs.p5.createVector(o.x, o.y), -Math.PI / 2, {
    speed: obj.projectileSpeed,
    aoe: obj.aoeRadius,
    color: obj.color,
  });
  obj.playSoundNow();   // carries the selected sound, like the downbeat gun
}

// A behaviour may hook the object's own beat (onBeat, keyed to its subdivision) and/or
// the bar downbeat (onDownbeat, beat 1 of every bar per the metronome's time signature).
export const BEHAVIORS = {
  none: { label: 'none' },
  'fire-on-downbeat': { label: 'fire on downbeat', onDownbeat: fireOnDownbeat },
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
