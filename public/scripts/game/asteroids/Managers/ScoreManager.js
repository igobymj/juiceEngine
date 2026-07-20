/*
ScoreManager

Tracks and renders the player score in the upper-right corner of the canvas.
Supports pulse animation on increment, slot machine count-up effect,
and triggers juice events (flying score numbers, particles at score location).

Created 2/10/26
*/

import Manager from "../../../engine/Managers/Manager.js";

export default class ScoreManager extends Manager {

	constructor(gameSession) {
		// (singleton guard removed — engine is de-singletoned; one per session)
		super(gameSession);

		this.__score = 0;
		this.__displayScore = 0;
		this.__pulseScale = 1.0;
		this.__margin = 20;
		// Right-edge inset so the score clears an overlaying editor panel (the
		// shell's canvas is full-width; the panel sits on top of it). 0 = anchor
		// to the true right edge. Set by the app when a panel is present.
		this.__rightInset = 0;

		// Cached from render() so addScore() can compute edge positions
		// without calling p5 text functions during the update phase
		this.__cachedTextW = 0;
		this.__cachedFontSize = 64;

		// Queue of flying scores waiting to arrive
		this.__pendingFlying = [];

		// Slot machine count-up state
		this.__counting = false;

		if (this.gameSession.verbose === true) {
			console.log("score Manager created successfully");
		}
	}

	addScore(asteroid) {
		const juiceSettings = this.gameSession.juiceSettings;
		const juiceFxOn = juiceSettings.container.cheats.juiceFx;

		const multiplier = juiceFxOn ? juiceSettings.container.cheats.score.multiplier : 1;
		const points = 1 * multiplier;

		// Score text bounding box center (uses cached measurements from render)
		const p = this.p5;
		const fontSize = this.__cachedFontSize;
		const hw = this.__cachedTextW / 2;
		const hh = fontSize / 2;
		const cx = this.gameSession.canvasWidth - this.__rightInset - this.__margin - hw;
		const cy = this.__margin + hh;

		const scoreCenter = p.createVector(cx, cy);

		// For flying score: find the edge of the score bbox facing the asteroid
		const ax = asteroid.position.x;
		const ay = asteroid.position.y;
		const dx = ax - cx;
		const dy = ay - cy;
		let edgePos = scoreCenter.copy();
		if (dx !== 0 || dy !== 0) {
			const sx = hw > 0 ? hw / Math.abs(dx || 1) : 1;
			const sy = hh > 0 ? hh / Math.abs(dy || 1) : 1;
			const s = Math.min(sx, sy);
			edgePos = p.createVector(cx + dx * s, cy + dy * s);
		}

		// Trigger flying score visual effect
		this.gameSession.juiceEventManager.addNew("scoreIncrement", {
			position: p.createVector(ax, ay),
			velocity: p.createVector(0, 0),
			scorePosition: edgePos,
			scoreValue: points
		});

		// Check if flying score is active
		const flyingActive = juiceFxOn
			&& juiceSettings.container.scoreIncrement.floatingScore.active;

		if (flyingActive) {
			const duration = juiceSettings.container.scoreIncrement.floatingScore.duration * 1000;
			this.__pendingFlying.push({
				points: points,
				arriveTime: this.gameSession.timeManager.time + duration,
				scorePosition: scoreCenter
			});
		} else {
			this._applyPoints(points, scoreCenter);
		}
	}

	_applyPoints(points, scorePosition) {
		const juiceSettings = this.gameSession.juiceSettings;
		const juiceFxOn = juiceSettings.container.cheats.juiceFx;

		this.__score += points;

		// Pulse fires when score increments
		if (juiceFxOn && juiceSettings.container.cheats.score.pulse) {
			this.__pulseScale = juiceSettings.container.cheats.score.pulseScale;
		}

		// Particles fire immediately
		this._fireArriveParticles(scorePosition);

		// Start slot machine count-up or snap immediately
		if (juiceFxOn && juiceSettings.container.cheats.score.slotMachine) {
			this.__counting = true;
		} else {
			this.__displayScore = this.__score;
		}
	}

	update() {
		const juiceSettings = this.gameSession.juiceSettings;
		const juiceFxOn = juiceSettings.container.cheats.juiceFx;
		const now = this.gameSession.timeManager.time;

		// Decay pulse scale back toward 1.0
		if (this.__pulseScale > 1.0) {
			this.__pulseScale *= 0.92;
			if (this.__pulseScale < 1.005) {
				this.__pulseScale = 1.0;
			}
		}

		// Process pending flying scores that have arrived
		for (let i = this.__pendingFlying.length - 1; i >= 0; i--) {
			if (now >= this.__pendingFlying[i].arriveTime) {
				const pending = this.__pendingFlying.splice(i, 1)[0];
				this._applyPoints(pending.points, pending.scorePosition);
			}
		}

		// Slot machine count-up animation
		if (juiceFxOn && juiceSettings.container.cheats.score.slotMachine && this.__counting) {
			if (this.__displayScore < this.__score) {
				this.__displayScore++;
			} else {
				this.__counting = false;
			}
		} else if (!(juiceFxOn && juiceSettings.container.cheats.score.slotMachine)) {
			// Keep display in sync when slot machine is off
			this.__displayScore = this.__score;
		}
	}

	render() {
		const p = this.p5;
		const baseFontSize = this.gameSession.juiceSettings.container.cheats.score.fontSize;

		p.push();
		p.resetMatrix();
		p.textFont('Hyperspace');
		p.textSize(baseFontSize);
		p.noStroke();
		p.fill(255);

		// Fixed right edge anchor — stable regardless of digit count
		const rx = this.gameSession.canvasWidth - this.__rightInset - this.__margin;
		const cy = this.__margin + baseFontSize / 2;

		// Cache text width of display score for addScore edge calculation
		const displayText = String(this.__displayScore);
		this.__cachedTextW = p.textWidth(displayText);
		this.__cachedFontSize = baseFontSize;

		// Static display with pulse scaling from center
		p.textAlign(p.RIGHT, p.CENTER);
		const textW = p.textWidth(displayText);
		const centerX = rx - textW / 2;
		p.translate(centerX, cy);
		p.scale(this.__pulseScale);
		p.textAlign(p.CENTER, p.CENTER);
		p.text(displayText, 0, 0);

		p.pop();
	}

	_fireArriveParticles(scorePosition) {
		this.gameSession.juiceEventManager.addNew("scoreArrive", {
			position: scorePosition,
			velocity: this.p5.createVector(0, 0)
		});
	}

	get score() {
		return this.__score;
	}

	set score(score) {
		this.__score = score;
	}

	get rightInset() {
		return this.__rightInset;
	}

	set rightInset(inset) {
		this.__rightInset = inset;
	}
}
