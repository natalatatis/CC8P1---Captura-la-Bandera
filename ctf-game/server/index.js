import { getNewPosition, calculateDistance, VICTORY_RADIUS } from './game/validator.js';

// Inside TCP 'data' event handler:
if (message.type === 'input') {
    const player = players.get(socket.id);
    const newPos = getNewPosition(player.pos, message.dir, 0.05); // 0.05s = 20 ticks/sec
    
    player.pos = newPos;

    // Check Victory condition for flag carrier[cite: 2]
    if (player.hasFlag) {
        const distToCenter = calculateDistance(player.pos, { x: 500, y: 500 });
        if (distToCenter > VICTORY_RADIUS) {
            // Trigger Victory 
        }
    }
}