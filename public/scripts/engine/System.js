/*
 * System — optional base class for game-loop systems.
 *
 * A "system" is anything with update() and/or render(); the loop iterates them
 * in priority order. You don't have to extend this — a plain object works — but
 * this standardises the pattern that kept getting hand-rolled: a gameSession
 * reference and an enable/disable flag.
 *
 * The game loop skips any system whose `enabled` is false (see GameLoop), so
 * toggling `setEnabled(false)` is all it takes to park a system. onEnable /
 * onDisable are hooks for setup/teardown around that transition.
 */
export default class System {
  constructor(gameSession) {
    this.gameSession = gameSession;
    this.enabled = true;
  }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) this.onEnable(); else this.onDisable();
  }

  onEnable() {}
  onDisable() {}

  update() {}
  render() {}
}
