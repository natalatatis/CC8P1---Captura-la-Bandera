export const MAP_SIZE = 1000;
export const PLAYER_RADIUS = 15;
export const INTERACT_RADIUS = 40;
export const VICTORY_RADIUS = 315; // 300 from the circle and 15 of the player
export const SPEED = 200;

// If value is less than 15, we return 15. 
// If value is more than 985, we return 985
// If it is in between, we keep the calculated value
export function clamp(val, min, max){
    return Math.max(min, Math.min(max, val));
}

// Calculate distances
export function calculateDistance(p1, p2){
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Get new position after movement
export function getNewPosition(currentPos, dir, dt){
    let dx = dir.x;
    let dy = dir.y;

    //Normalization to prevent diagonal speed boosting
    //Magnitude
    const mag = Math.sqrt(dx * dx + dy * dy);
    if(mag > 0){
        dx /= mag;
        dy /= mag;
    }

    let nextX = currentPos.x + (dx * SPEED * dt);
    let nextY = currentPos.y + (dy * SPEED * dt);

    //Apply limits (15 to 985)
    return{
        x: clamp(nextX, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS),
        y: clamp(nextY, PLAYER_RADIUS, MAP_SIZE - PLAYER_RADIUS)
    };
}