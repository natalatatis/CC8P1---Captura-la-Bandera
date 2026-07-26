import net from 'node:net';
import crypto from 'node:crypto';
import { MessageParser } from '../../protocol/parser.js';
import { MESSAGE_MAX_SIZE, NAME_MAX_LENGTH } from '../game/validator.js';

// Control characters and line breaks are not allowed in names (section 6.2 /
// join field rules). Matches C0 control chars + DEL.
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

function sendMsg(socket, obj) {
    if (!socket.destroyed) socket.write(JSON.stringify(obj) + '\n');
}

export function createGameServer(gameState) {
    // Tracks every connected socket by player_id so the server can broadcast
    // lobby / countdown / start / state / game_over to everyone, as required
    // by the protocol's message catalog (section 2.3).
    const sockets = new Map();

    function broadcast(obj) {
        for (const socket of sockets.values()) sendMsg(socket, obj);
    }

    gameState.on('lobby', broadcast);
    gameState.on('countdown', broadcast);
    gameState.on('start', broadcast);
    gameState.on('state', broadcast);
    gameState.on('game_over', broadcast);

    const server = net.createServer((socket) => {
        const parser = new MessageParser();
        let playerId = null;
        let isSpectator = false;

        socket.on('data', (chunk) => {
            // 2.1 / 6.2: any message over message_max_size (64 KB, including
            // the trailing \n) is rejected and the TCP connection is closed.
            if (parser.buffer.length + chunk.length > MESSAGE_MAX_SIZE) {
                sendMsg(socket, { type: 'error', reason: 'MESSAGE_TOO_LARGE' });
                socket.end();
                return;
            }

            const messages = parser.feed(chunk);

            for (const msg of messages) {
                if (!msg || typeof msg.type !== 'string') {
                    sendMsg(socket, { type: 'error', reason: 'MISSING_FIELD' });
                    continue;
                }

                switch (msg.type) {
                    case 'join': {
                        // A second join on the same connection: rejected,
                        // connection stays open (section 2.3.2).
                        if (playerId) {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }

                        // Protocol version must be exactly 1.
                        if (msg.v !== 1) {
                            sendMsg(socket, { type: 'error', reason: 'VERSION_MISMATCH' });
                            socket.end();
                            break;
                        }

                        // Project-specific extension, not part of the class
                        // protocol: "spectator" is an unknown field to any
                        // other team's server, which must ignore it
                        // silently (section 2.2) — so this never breaks
                        // interop. A spectator only ever watches: it never
                        // occupies a player slot, never counts toward
                        // min/max players, and can join at any phase
                        // (lobby, countdown, mid-match, whenever the host
                        // opens their own viewer).
                        const wantsSpectator = msg.spectator === true;

                        if (!wantsSpectator) {
                            // join while countdown/playing: GAME_STARTED, close.
                            if (gameState.phase !== 'lobby') {
                                sendMsg(socket, { type: 'error', reason: 'GAME_STARTED' });
                                socket.end();
                                break;
                            }

                            if (gameState.isFull()) {
                                sendMsg(socket, { type: 'error', reason: 'LOBBY_FULL' });
                                socket.end();
                                break;
                            }
                        }

                        const trimmedName = typeof msg.name === 'string' ? msg.name.trim() : '';
                        const nameIsValid =
                            trimmedName.length >= 1 &&
                            trimmedName.length <= NAME_MAX_LENGTH &&
                            !CONTROL_CHARS_RE.test(trimmedName);

                        if (!nameIsValid) {
                            sendMsg(socket, { type: 'error', reason: 'NAME_INVALID' });
                            break;
                        }

                        playerId = crypto.randomUUID();
                        isSpectator = wantsSpectator;
                        sockets.set(playerId, socket);

                        // welcome is sent to THIS client first; addPlayer()
                        // (below) triggers the 'lobby' broadcast, which must
                        // arrive after welcome for the newly joined client
                        // (section 2.3.2, "cuándo se envía lobby").
                        sendMsg(socket, {
                            type: 'welcome',
                            player_id: playerId,
                            config: {
                                map_size: gameState.MAP_SIZE,
                                circle_radius: gameState.CIRCLE_RADIUS,
                                player_radius: 15,
                                interact_radius: 40,
                                speed: 200,
                                tick_rate: gameState.TICK_RATE
                            }
                        });

                        if (!isSpectator) {
                            gameState.addPlayer(playerId, trimmedName);
                        }
                        break;
                    }

                    case 'input': {
                        if (!playerId) {
                            sendMsg(socket, { type: 'error', reason: 'NOT_JOINED' });
                            break;
                        }
                        if (isSpectator) {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        if (gameState.phase !== 'playing') {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }

                        const dir = msg.dir;
                        const validDir =
                            dir &&
                            Number.isInteger(dir.x) && dir.x >= -1 && dir.x <= 1 &&
                            Number.isInteger(dir.y) && dir.y >= -1 && dir.y <= 1;

                        if (validDir) {
                            gameState.setPlayerInput(playerId, dir.x, dir.y);
                        } else {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_FIELD' });
                        }
                        break;
                    }

                    case 'interact': {
                        if (!playerId) {
                            sendMsg(socket, { type: 'error', reason: 'NOT_JOINED' });
                            break;
                        }
                        if (isSpectator) {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        if (gameState.phase !== 'playing') {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        // Deferred: resolved after movement/victory for this
                        // tick, in the order messages arrived (section 4.1/5.3).
                        gameState.queueInteract(playerId);
                        break;
                    }

                    default:
                        sendMsg(socket, { type: 'error', reason: 'UNKNOWN_TYPE' });
                        break;
                }
            }
        });

        socket.on('close', () => {
            if (playerId) {
                sockets.delete(playerId);
                if (!isSpectator) gameState.removePlayer(playerId);
            }
        });

        socket.on('error', () => {
            // Connection errors are handled uniformly through 'close'.
        });
    });

    return server;
}