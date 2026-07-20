/*
 * SoundEffector — plays a registered sound when an event fires.
 *
 * A juice effector like the visual ones, so a sound is assigned to an event in
 * exactly the same data-driven way: give the event a `sound` block
 *   sound: { active: true, synth: 'blip', clip: 'none', volume: -6, rate: 1 }
 * and JuiceEventManager instantiates this on fire. A chosen `clip` (an audio
 * file from media/sounds) wins; otherwise it plays the `synth` (a procedural
 * sound). Then it reports finished immediately (one-shot).
 *
 * Both are looked up by name in the SoundManager; each exposes play({volume,rate}).
 */
export default class SoundEffector {
  constructor(gameSession, eventName, triggerObject) {
    const params = gameSession.juiceSettings.container[eventName].sound;
    const sm = gameSession.soundManager;
    if (!sm || !params) return;
    const name = (params.clip && params.clip !== 'none') ? params.clip : params.synth;
    const sound = name ? sm.getSound(name) : null;
    if (sound && typeof sound.play === 'function') {
      sound.play({ volume: params.volume, rate: params.rate });
    }
  }

  update() {}
  render() {}
  finished() { return true; }   // fire-and-forget; removed next frame
}
