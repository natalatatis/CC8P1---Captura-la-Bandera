export const MAP_SIZE = 1000;
export const CIRCLE_RADIUS = 300;
export const PLAYER_RADIUS = 15;
export const INTERACT_RADIUS = 40;
export const SPEED = 200;
export const TICK_RATE = 20;

// Server-side constants (not sent in welcome.config).
export const COUNTDOWN_SECONDS = 5;
export const MIN_PLAYERS = 1;           // minimum to trigger/keep the countdown
export const POST_GAME_SECONDS = 5;     // pause after game_over before back to lobby
export const CIRCLE_CENTER = 500;       // = MAP_SIZE / 2
export const SPAWN_RADIUS_MIN = 350;
export const SPAWN_RADIUS_MAX = 450;
export const VICTORY_RADIUS = 315;      // CIRCLE_RADIUS + PLAYER_RADIUS

// Protocol-wide limits.
export const MAX_PLAYERS = 100;
export const NAME_MAX_LENGTH = 20;
export const MESSAGE_MAX_SIZE = 64 * 1024; // 64 KB

// If value is less than 15, we return 15.
// If value is more than 985, we return 985.
// If it is in between, we keep the calculated value.
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Euclidean distance (section 3.2).
export function calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function distanceFromCenter(x, y) {
    return calculateDistance({ x, y }, { x: CIRCLE_CENTER, y: CIRCLE_CENTER });
}

// Half-away-from-zero rounding to 1 decimal, per section 2.3.2
// ("redondeo half-away-from-zero"). toFixed() alone can land on
// round-half-to-even for some floating point values, so we do it by hand.
export function roundHalfAwayFromZero(num, decimals = 1) {
    const factor = 10 ** decimals;
    return Math.sign(num) * Math.round(Math.abs(num) * factor) / factor;
}

// Get new position after movement. Diagonals are normalized so speed is
// identical in all 8 directions (section 3.3).
export function getNewPosition(currentPos, dir, dt) {
    let dx = dir.x;
    let dy = dir.y;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
        dx /= mag;
        dy /= mag;
    }

    const nextX = currentPos.x + (dx * SPEED * dt);
    const nextY = currentPos.y + (dy * SPEED * dt);

    return {
        x: clamp(nextX, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS),
        y: clamp(nextY, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS)
    };
}

// Uniform random spawn on the ring around the circle (section 3.3):
// angle θ ∈ [0, 2π), radius R ∈ [350, 450].
export function randomSpawnPosition() {
    const theta = Math.random() * 2 * Math.PI;
    const r = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);
    return {
        x: CIRCLE_CENTER + r * Math.cos(theta),
        y: CIRCLE_CENTER + r * Math.sin(theta)
    };
}