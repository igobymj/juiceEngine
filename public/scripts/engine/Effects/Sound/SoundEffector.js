/*
 * SoundEffector — plays a registered sound when an event fires.
 *
 * A juice effector like the visual ones, so a sound is assigned to an event in
 * exactly the same data-driven way: give the event a `sound` block
 *   sound: { active: true, clip: 'blip', volume: -6, rate: 1 }
 * and JuiceEventManager instantiates this on fire. It plays the clip named by
 * `clip` from the SoundManager, then reports finished immediately (one-shot).
 *
 * A "clip" is anything the SoundManager holds that exposes play({volume,rate}).
 */
export default class SoundEffector {
  constructor(gameSession, eventName, triggerObject) {
    const params = gameSession.juiceSettings.container[eventName].sound;
    const sm = gameSession.soundManager;
    const clip = sm && params && params.clip ? sm.getSound(params.clip) : null;
    if (clip && typeof clip.play === 'function') {
      clip.play({ volume: params.volume, rate: params.rate });
    }
  }

  update() {}
  render() {}
  finished() { return true; }   // fire-and-forget; removed next frame
}
