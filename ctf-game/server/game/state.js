import { EventEmitter } from 'node:events';
import {
    MAP_SIZE,
    PLAYER_RADIUS,
    INTERACT_RADIUS,
    VICTORY_RADIUS,
    SPEED,
    getNewPosition,
    calculateDistance
} from './validator.js';

// GameState emits events so the network layer (gameSocket.js) can broadcast
// protocol messages ("lobby", "countdown", "start", "state", "game_over")
// to every connected socket without the game logic knowing anything about sockets.
export class GameState extends EventEmitter {
    constructor() {
        super();

        this.MAP_SIZE = MAP_SIZE;
        this.CIRCLE_RADIUS = 300;
        this.TICK_RATE = 20;
        this.CENTRAL_COORD = 500;
        this.COUNTDOWN_SECONDS = 5; // per protocol
        this.MAX_PLAYERS = 100;

        this.players = new Map(); // key: player_id, value: player object
        this.flag = {
            x: this.CENTRAL_COORD,
            y: this.CENTRAL_COORD,
            owner: null,
            version: 1
        };

        this.phase = 'lobby'; // 'lobby' | 'countdown' | 'playing' | 'finished'
        this.winner = null;
        this.countdown = this.COUNTDOWN_SECONDS;
        this._lastAnnouncedSecond = null;
    }

    isFull() {
        return this.players.size >= this.MAX_PLAYERS;
    }

    addPlayer(id, name) {
        this.players.set(id, {
            id,
            name: name.substring(0, 20),
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 200,
            dir: { x: 0, y: 0 }
        });
        this.emitLobby();
    }

    removePlayer(id) {
        if (this.flag.owner === id) {
            this.flag.x = this.CENTRAL_COORD;
            this.flag.y = this.CENTRAL_COORD;
            this.flag.owner = null;
            this.flag.version++;
        }
        this.players.delete(id);

        // If the lobby empties out mid countdown/game, protocol says
        // reset to lobby when everyone disconnects.
        if (this.players.size === 0 && this.phase !== 'lobby') {
            this.phase = 'lobby';
            this.countdown = this.COUNTDOWN_SECONDS;
            this._lastAnnouncedSecond = null;
        }

        if (this.phase === 'lobby') this.emitLobby();
    }

    setPlayerInput(id, dirX, dirY) {
        const player = this.players.get(id);
        if (player) player.dir = { x: dirX, y: dirY };
    }

    emitLobby() {
        this.emit('lobby', {
            type: 'lobby',
            players: Array.from(this.players.values()).map(p => ({ id: p.id, name: p.name }))
        });
    }

    update(deltaTime = 1 / this.TICK_RATE) {
        switch (this.phase) {
            case 'lobby':
                this.updateLobby();
                break;
            case 'countdown':
                this.updateCountdown(deltaTime);
                break;
            case 'playing':
                this.updatePlaying(deltaTime);
                break;
            case 'finished':
                break;
        }
    }

    updateLobby() {
        // Countdown starts once at least one player has joined.
        if (this.players.size >= 1) {
            this.phase = 'countdown';
            this.countdown = this.COUNTDOWN_SECONDS;
            this._lastAnnouncedSecond = null;
        }
    }

    updateCountdown(deltaTime) {
        this.countdown -= deltaTime;

        const secondsLeft = Math.max(0, Math.ceil(this.countdown));
        if (secondsLeft !== this._lastAnnouncedSecond) {
            this._lastAnnouncedSecond = secondsLeft;
            this.emit('countdown', { type: 'countdown', seconds: secondsLeft });
        }

        if (this.countdown <= 0) {
            this.phase = 'playing';
            this.emit('start', { type: 'start' });
        }
    }

    updatePlaying(deltaTime) {
        for (const player of this.players.values()) {
            if (player.dir.x !== 0 || player.dir.y !== 0) {
                const newPos = getNewPosition({ x: player.x, y: player.y }, player.dir, deltaTime);
                player.x = newPos.x;
                player.y = newPos.y;
            }
        }

        if (this.flag.owner) {
            const carrier = this.players.get(this.flag.owner);

            if (carrier) {
                this.flag.x = carrier.x;
                this.flag.y = carrier.y;

                const distanceFromCenter = calculateDistance(
                    { x: carrier.x, y: carrier.y },
                    { x: this.CENTRAL_COORD, y: this.CENTRAL_COORD }
                );

                // VICTORY_RADIUS (315) = circle radius + player radius, so the
                // player's whole body must clear the circle, not just its center.
                if (distanceFromCenter > VICTORY_RADIUS) {
                    this.phase = 'finished';
                    this.winner = carrier.id;
                    this.emit('game_over', { type: 'game_over', winner: carrier.id });
                    return;
                }
            } else {
                this.flag.owner = null;
                this.flag.x = this.CENTRAL_COORD;
                this.flag.y = this.CENTRAL_COORD;
                this.flag.version++;
            }
        }

        // Broadcast world state at tick_rate (20/s), per protocol catalog.
        this.emit('state', this.getStateSnapshot());
    }

    handleInteract(playerId) {
        if (this.phase !== 'playing') return false;

        const player = this.players.get(playerId);
        if (!player) return false;

        const distance = calculateDistance(
            { x: player.x, y: player.y },
            { x: this.flag.x, y: this.flag.y }
        );

        if (distance <= INTERACT_RADIUS && this.flag.owner !== playerId) {
            this.flag.owner = playerId;
            this.flag.version++;
            return true;
        }

        return false;
    }

    getStateSnapshot() {
        const playersArray = Array.from(this.players.values()).map(player => ({
            id: player.id,
            x: Number(player.x.toFixed(1)),
            y: Number(player.y.toFixed(1))
        }));

        return {
            type: 'state',
            flag: {
                owner: this.flag.owner,
                x: Number(this.flag.x.toFixed(1)),
                y: Number(this.flag.y.toFixed(1))
            },
            players: playersArray
        };
    }
}