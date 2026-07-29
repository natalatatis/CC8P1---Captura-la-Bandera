import { EventEmitter } from 'node:events';
import {
    MAP_SIZE,
    CIRCLE_RADIUS,
    CIRCLE_CENTER,
    TICK_RATE,
    COUNTDOWN_SECONDS,
    MIN_PLAYERS,
    POST_GAME_SECONDS,
    VICTORY_RADIUS,
    MAX_PLAYERS,
    getNewPosition,
    randomSpawnPosition,
    distanceFromCenter,
    roundHalfAwayFromZero
} from './validator.js';

// GameState emits events so the network layer (gameSocket.js) can broadcast
// protocol messages ("lobby", "countdown", "start", "state", "game_over")
// to every connected socket without the game logic knowing anything about
// sockets.
export class GameState extends EventEmitter {
    constructor() {
        super();

        this.MAP_SIZE = MAP_SIZE;
        this.CIRCLE_RADIUS = CIRCLE_RADIUS;
        this.TICK_RATE = TICK_RATE;
        this.CENTRAL_COORD = CIRCLE_CENTER;
        this.COUNTDOWN_SECONDS = COUNTDOWN_SECONDS;
        this.MIN_PLAYERS = MIN_PLAYERS;
        this.POST_GAME_SECONDS = POST_GAME_SECONDS;
        this.MAX_PLAYERS = MAX_PLAYERS;

        this.players = new Map(); // key: player_id, value: player object

        // insideCircle tracks whether the *current carrier* was at distance
        // <= VICTORY_RADIUS the last time we checked (at capture/steal time,
        // and every tick afterwards). Victory only fires on the transition
        // true -> false 
        this.flag = {
            x: this.CENTRAL_COORD,
            y: this.CENTRAL_COORD,
            owner: null,
            insideCircle: true
        };

        this.phase = 'lobby'; // 'lobby' | 'countdown' | 'playing' | 'finished'
        this.winner = null;
        this.countdown = this.COUNTDOWN_SECONDS;
        this._lastAnnouncedSecond = null;
        this.postGameTimer = 0;

        // Interact requests are queued and only resolved after movement +
        // victory are evaluated for the tick. This also makes
        // TCP arrival order the one and only tie-break rule 
        this.pendingInteracts = [];
    }

    isFull() {
        return this.players.size >= this.MAX_PLAYERS;
    }

    addPlayer(id, name) {
        this.players.set(id, {
            id,
            name,
            x: this.CENTRAL_COORD,
            y: this.CENTRAL_COORD,
            dir: { x: 0, y: 0 }
        });
        if (this.phase === 'lobby') this.emitLobby();
    }

    removePlayer(id) {
        if (this.flag.owner === id) {
            this.flag.x = this.CENTRAL_COORD;
            this.flag.y = this.CENTRAL_COORD;
            this.flag.owner = null;
            this.flag.insideCircle = true;
        }
        this.players.delete(id);

        // "Se desconectan todos": reset to lobby regardless of phase.
        if (this.players.size === 0) {
            this.resetToLobby();
            return;
        }

        // Countdown requires min_players (2) to keep running; drop below
        // that and it's aborted back to the lobby immediately.
        if (this.phase === 'countdown' && this.players.size < this.MIN_PLAYERS) {
            this.phase = 'lobby';
            this.countdown = this.COUNTDOWN_SECONDS;
            this._lastAnnouncedSecond = null;
            this.emitLobby();
            return;
        }

        if (this.phase === 'lobby') this.emitLobby();
    }

    setPlayerInput(id, dirX, dirY) {
        const player = this.players.get(id);
        if (player) player.dir = { x: dirX, y: dirY };
    }

    // Called by gameSocket.js when a client sends 'interact'. Deferred to
    // the end of the current tick's movement/victory evaluation.
    queueInteract(playerId) {
        this.pendingInteracts.push(playerId);
    }

    emitLobby() {
        this.emit('lobby', {
            type: 'lobby',
            players: Array.from(this.players.values()).map(p => ({ id: p.id, name: p.name }))
        });
    }

    resetToLobby() {
        this.phase = 'lobby';
        this.winner = null;
        this.flag.owner = null;
        this.flag.x = this.CENTRAL_COORD;
        this.flag.y = this.CENTRAL_COORD;
        this.flag.insideCircle = true;
        this.countdown = this.COUNTDOWN_SECONDS;
        this._lastAnnouncedSecond = null;
        this.postGameTimer = 0;
        this.pendingInteracts.length = 0;
        this.emitLobby();
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
                this.updateFinished(deltaTime);
                break;
        }
    }

    updateLobby() {
        // Countdown starts once min_players (2) have joined.
        if (this.players.size >= this.MIN_PLAYERS) {
            this.phase = 'countdown';
            this.countdown = this.COUNTDOWN_SECONDS;
            this._lastAnnouncedSecond = null;
            console.log(`[GAME] Countdown started with ${this.players.size} players.`);
        }
    }

    updateCountdown(deltaTime) {
        this.countdown -= deltaTime;

        // Exactly 5, 4, 3, 2, 1 — never 0 — then 'start' immediately after.
        const secondsLeft = Math.max(1, Math.ceil(this.countdown));
        if (secondsLeft !== this._lastAnnouncedSecond && this.countdown > 0) {
            this._lastAnnouncedSecond = secondsLeft;
            this.emit('countdown', { type: 'countdown', seconds: secondsLeft });
        }

        if (this.countdown <= 0) {
            // Spawn is assigned here, at 'start' time, not at join time
            for (const player of this.players.values()) {
                const spawn = randomSpawnPosition();
                player.x = spawn.x;
                player.y = spawn.y;
            }
            this.flag.owner = null;
            this.flag.x = this.CENTRAL_COORD;
            this.flag.y = this.CENTRAL_COORD;
            this.flag.insideCircle = true;

            this.phase = 'playing';
            this.emit('start', { type: 'start' });
        }
    }

    updatePlaying(deltaTime) {
        // 1) Movement first.
        for (const player of this.players.values()) {
            if (player.dir.x !== 0 || player.dir.y !== 0) {
                const newPos = getNewPosition({ x: player.x, y: player.y }, player.dir, deltaTime);
                player.x = newPos.x;
                player.y = newPos.y;
            }
        }

        // 2) Victory condition, evaluated before interactions
        if (this.flag.owner) {
            const carrier = this.players.get(this.flag.owner);

            if (carrier) {
                this.flag.x = carrier.x;
                this.flag.y = carrier.y;

                const dist = distanceFromCenter(carrier.x, carrier.y);
                const isInside = dist <= VICTORY_RADIUS;

                // Win only on the true -> false transition (inside/border,
                // then strictly outside), never just "currently outside".
                if (this.flag.insideCircle && !isInside) {
                    this.phase = 'finished';
                    this.winner = carrier.id;
                    this.postGameTimer = this.POST_GAME_SECONDS;
                    this.emit('game_over', { type: 'game_over', winner: carrier.id });
                    return; // don't process queued interacts once the round is over
                }

                this.flag.insideCircle = isInside;
            } else {
                // Carrier disconnected mid-tick (shouldn't normally happen,
                // removePlayer already resets the flag, but stay defensive).
                this.flag.owner = null;
                this.flag.x = this.CENTRAL_COORD;
                this.flag.y = this.CENTRAL_COORD;
                this.flag.insideCircle = true;
            }
        }

        // 3) Interactions, deferred until after movement/victory, processed
        // strictly in TCP arrival order (section 5.3 — the only tie-break).
        if (this.pendingInteracts.length > 0) {
            const queued = this.pendingInteracts;
            this.pendingInteracts = [];
            for (const playerId of queued) {
                if (this.phase !== 'playing') break; // game just ended mid-batch
                this.tryInteract(playerId);
            }
        }

        if (this.phase === 'playing') {
            this.emit('state', this.getStateSnapshot());
        }
    }

    updateFinished(deltaTime) {
        this.postGameTimer -= deltaTime;
        if (this.postGameTimer <= 0) {
            this.resetToLobby();
        }
    }

    // Capture (bandera libre) and steal (robo) share the same distance
    // check (section 3.3: for robo, distance to the carrier is the only
    // requirement, in or out of the circle).
    tryInteract(playerId) {
        const player = this.players.get(playerId);
        if (!player) return false;

        const distance = Math.hypot(player.x - this.flag.x, player.y - this.flag.y);

        if (distance <= 40 && this.flag.owner !== playerId) {
            this.flag.owner = playerId;
            this.flag.x = player.x;
            this.flag.y = player.y;
            this.flag.insideCircle = distanceFromCenter(player.x, player.y) <= VICTORY_RADIUS;
            return true;
        }

        return false;
    }

    getStateSnapshot() {
        const playersArray = Array.from(this.players.values()).map(player => ({
            id: player.id,
            x: roundHalfAwayFromZero(player.x),
            y: roundHalfAwayFromZero(player.y)
        }));

        return {
            type: 'state',
            flag: {
                owner: this.flag.owner, // always null when free, never 0
                x: roundHalfAwayFromZero(this.flag.x),
                y: roundHalfAwayFromZero(this.flag.y)
            },
            players: playersArray
        };
    }
}