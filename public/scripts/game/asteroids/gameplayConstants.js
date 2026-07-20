// gameplayConstants.js
// Central location for gameplay tuning constants.
// Grouped by the system they belong to.

// Ship
export const SHIP_ROTATION_SPEED = 0.000627510040161;
export const SHIP_THRUST_AMOUNT = 0.01 / 60; // .01 per frame converted into seconds
export const SHIP_SPEED_CLAMP = 0.4;
export const SHIP_DEAD_TIME = 4000;
export const SHIP_SCALE = 0.5;
export const SHIP_FLAME_RENDER_INTERVAL = 5;

// Asteroid
export const ASTEROID_VELOCITY_MAX_LARGE = 2;
export const ASTEROID_VELOCITY_MAX_MEDIUM = 3;
export const ASTEROID_VELOCITY_MAX_SMALL = 4;
export const ASTEROID_MOVEMENT_MULTIPLIER = 0.1;
export const ASTEROID_ROTATION_SPEED = 128;
export const ASTEROID_EYEBALL_SIZE_LARGE = 40;
export const ASTEROID_EYEBALL_SIZE_MEDIUM = 20;
export const ASTEROID_EYEBALL_SIZE_SMALL = 10;

// Bullet
export const BULLET_DURATION = 800;
export const BULLET_HIT_DELAY_FRAMES = 3;

// AsteroidManager
export const LEVEL_START_ROCKS = 5;
export const LEVEL_RESET_DELAY = 4000;
export const SAFE_SPAWN_DISTANCE = 200;
export const ASTEROID_SPAWN_RANGE = 1000;

// BulletManager
export const AMMO_LIMIT = 4;

// TimeManager
export const DEFAULT_FRAME_RATE = 60;
export const DEFAULT_FIXED_RATE = 60;
