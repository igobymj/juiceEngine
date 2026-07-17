# juiceEngine

A small p5.js game-feel engine, extracted from the *primitives* project as a
reusable starter shell.

## What's here

- **Pluggable game loop** — register any object with `update()`/`render()` on
  `gameSession.gameLoop` with a priority; the loop iterates in order. That's the
  whole extension model.
- **Juice toolkit** — data-driven effects (screen shake, particle bursts,
  time-slow, color flash, floating score, deconstruct) fired by name via
  `juiceEventManager.addNew(event, trigger)`, configured from a JSON container.
- **Live juice editor** — a side panel whose controls are generated from effect
  schemas; edits apply immediately and `save` persists to `juice.json` via the
  dev server (`POST /api/juice`).
- **Input dispatch, time, and a service-locator `GameSession`.**

## Run

```
npm install
npm start        # http://localhost:3000  (set PORT to run a second instance)
```

Click the canvas to fire the demo `click` event; tune it in the panel and save.

## Making a project

Everything under `public/scripts/engine` is app-agnostic. Write your own systems
and wire them in `public/scripts/index.js` — that's the only file a new project
needs to change.

## Roadmap

This is step 1 (engine extraction). Planned: a `createGame()` bootstrap, a
`System` base class with mode-aware enable/disable, a `ModeManager`, and a
generalized (not juice-only) settings editor + config persistence.
