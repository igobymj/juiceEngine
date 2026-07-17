/*
FloatingScoreEffector

Animates a "+N" text from the asteroid impact position up to the score
HUD position in the upper-right corner with ease-out motion, fading
and scaling down as it arrives.

Created 2/10/26
*/

export default class FloatingScoreEffector {

	constructor(gameSession, eventName, triggerObject) {
		this.__gameSession = gameSession;

		const settings = gameSession.juiceSettings.container[eventName].floatingScore;
		this.__duration = settings.duration * 1000; // ms
		this.__fontSize = settings.fontSize;

		this.__startTime = gameSession.timeManager.time;

		// Start at asteroid position, end at score HUD position
		this.__startX = triggerObject.position.x;
		this.__startY = triggerObject.position.y;
		this.__endX = triggerObject.scorePosition.x;
		this.__endY = triggerObject.scorePosition.y;

		this.__currentX = this.__startX;
		this.__currentY = this.__startY;

		this.__scoreValue = triggerObject.scoreValue;
		this.__alpha = 255;
		this.__scale = 1;
	}

	update() {
		const elapsed = this.__gameSession.timeManager.time - this.__startTime;
		const t = Math.min(elapsed / this.__duration, 1);

		// Ease-out cubic
		const eased = 1 - Math.pow(1 - t, 3);

		// Lerp position
		this.__currentX = this.__startX + (this.__endX - this.__startX) * eased;
		this.__currentY = this.__startY + (this.__endY - this.__startY) * eased;

		// Fade alpha in last 30% of duration
		if (t > 0.7) {
			this.__alpha = 255 * (1 - (t - 0.7) / 0.3);
		} else {
			this.__alpha = 255;
		}

		// Scale down as it approaches target
		this.__scale = 1 - eased * 0.5;
	}

	render() {
		if (this.__alpha <= 0) return;

		const p = this.__gameSession.p5;

		p.push();
		p.resetMatrix();
		p.textAlign(p.CENTER, p.CENTER);
		p.textFont('Hyperspace');
		p.textSize(this.__fontSize * this.__scale);
		p.noStroke();
		p.fill(255, this.__alpha);
		p.text("+" + this.__scoreValue, this.__currentX, this.__currentY);
		p.pop();
	}

	finished() {
		const elapsed = this.__gameSession.timeManager.time - this.__startTime;
		if (elapsed >= this.__duration) {
			return "floatingScore";
		}
		return false;
	}
}
