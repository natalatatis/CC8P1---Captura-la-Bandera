import { 
    MAP_SIZE, 
    PLAYER_RADIUS, 
    INTERACT_RADIUS, 
    SPEED, 
    getNewPosition, 
    calculateDistance 
} from './validator.js';

export class GameState {
    constructor() {
        this.CIRCLE_RADIUS = 300;
        this.TICK_RATE = 20;
        this.CENTRAL_COORD = 500;

        // Game Entities
        this.players = new Map(); // key: player_id, value: player object
        this.flag = {
            x: this.CENTRAL_COORD,
            y: this.CENTRAL_COORD,
            owner: null, // null if free, otherwise player_id string
            version: 1
        };

        this.phase = 'lobby'; // 'lobby', 'countdown', 'playing', 'finished'
        this.winner = null;
    }

    // Add a new player to the game state
    addPlayer(id, name) {
        this.players.set(id, {
            id,
            name: name.substring(0, 20),
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 200,
            dir: { x: 0, y: 0 }
        });
    }

    // Remove player on disconnect
    removePlayer(id) {
        if (this.flag.owner === id) {
            this.flag.x = this.CENTRAL_COORD;
            this.flag.y = this.CENTRAL_COORD;
            this.flag.owner = null;
            this.flag.version++;
        }
        this.players.delete(id);
    }

    // Update player intent direction
    setPlayerInput(id, dirX, dirY) {
        const player = this.players.get(id);
        if (player) {
            player.dir = { x: dirX, y: dirY };
        }
    }

    // Main tick update loop (runs 20 times per second)
    update(deltaTime = 1 / this.TICK_RATE) {
        if (this.phase !== 'playing') return;

        // 1 Update positions of all players using validator's safe movement function
        for (const [id, player] of this.players.entries()) {
            if (player.dir.x !== 0 || player.dir.y !== 0) {
                const newPos = getNewPosition({ x: player.x, y: player.y }, player.dir, deltaTime);
                player.x = newPos.x;
                player.y = newPos.y;
            }
        }

        // 2 Update flag position if it is owned by a player
        if (this.flag.owner) {
            const carrier = this.players.get(this.flag.owner);
            if (carrier) {
                this.flag.x = carrier.x;
                this.flag.y = carrier.y;

                // 3 Evaluate Victory Condition using validator's distance calculator
                const distanceFromCenter = calculateDistance(
                    { x: carrier.x, y: carrier.y }, 
                    { x: this.CENTRAL_COORD, y: this.CENTRAL_COORD }
                );

                if (distanceFromCenter > this.CIRCLE_RADIUS) {
                    this.phase = 'finished';
                    this.winner = carrier.id;
                }
            } else {
                this.flag.owner = null;
                this.flag.x = this.CENTRAL_COORD;
                this.flag.y = this.CENTRAL_COORD;
            }
        }
    }

    // Handle interact request (grab free flag or steal from carrier)
    handleInteract(playerId) {
        if (this.phase !== 'playing') return false;

        const player = this.players.get(playerId);
        if (!player) return false;

        const distance = calculateDistance(
            { x: player.x, y: player.y }, 
            { x: this.flag.x, y: this.flag.y }
        );

        if (distance <= INTERACT_RADIUS) {
            if (this.flag.owner === null) {
                this.flag.owner = playerId;
                this.flag.version++;
                return true;
            } else if (this.flag.owner !== playerId) {
                this.flag.owner = playerId;
                this.flag.version++;
                return true;
            }
        }
        return false;
    }

    // Export state snapshot for state synchronization messages
    getStateSnapshot() {
        const playersArray = Array.from(this.players.values()).map(p => ({
            id: p.id,
            x: Number(p.x.toFixed(1)),
            y: Number(p.y.toFixed(1))
        }));

        return {
            type: "state",
            flag: {
                owner: this.flag.owner,
                x: Number(this.flag.x.toFixed(1)),
                y: Number(this.flag.y.toFixed(1))
            },
            players: playersArray
        };
    }
}