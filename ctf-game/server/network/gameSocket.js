import net from 'node:net';
import crypto from 'node:crypto';
import { MessageParser } from '../../protocol/parser.js';

const MESSAGE_MAX_SIZE = 64 * 1024; // 64 KB

function sendMsg(socket, obj) {
    if (!socket.destroyed) socket.write(JSON.stringify(obj) + '\n');
}

export function createGameServer(gameState) {
    // Tracks every connected socket by player_id so the server can broadcast
    // lobby / countdown / start / state / game_over to everyone, as required
    // by the protocol's message catalog 
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

        socket.on('data', (chunk) => {
            // 5.1: mensajes que superen el tamaño máximo permitido se rechazan
            // y la conexión se cierra.
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
                        if (playerId) {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        if (gameState.phase !== 'lobby') {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        if (msg.v !== 1) {
                            sendMsg(socket, { type: 'error', reason: 'VERSION_MISMATCH' });
                            socket.end();
                            break;
                        }
                        if (gameState.isFull()) {
                            sendMsg(socket, { type: 'error', reason: 'LOBBY_FULL' });
                            socket.end();
                            break;
                        }
                        if (!msg.name || typeof msg.name !== 'string' || msg.name.trim().length === 0 || msg.name.length > 20) {
                            sendMsg(socket, { type: 'error', reason: 'NAME_INVALID' });
                            break;
                        }

                        playerId = crypto.randomUUID();
                        sockets.set(playerId, socket);
                        gameState.addPlayer(playerId, msg.name.trim());

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
                        break;
                    }

                    case 'input': {
                        if (!playerId) {
                            sendMsg(socket, { type: 'error', reason: 'NOT_JOINED' });
                            break;
                        }
                        if (gameState.phase !== 'playing') {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        if (msg.dir && typeof msg.dir.x === 'number' && typeof msg.dir.y === 'number' &&
                            msg.dir.x >= -1 && msg.dir.x <= 1 && msg.dir.y >= -1 && msg.dir.y <= 1) {
                            gameState.setPlayerInput(playerId, msg.dir.x, msg.dir.y);
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
                        if (gameState.phase !== 'playing') {
                            sendMsg(socket, { type: 'error', reason: 'INVALID_PHASE' });
                            break;
                        }
                        gameState.handleInteract(playerId);
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
                gameState.removePlayer(playerId);
            }
        });

        socket.on('error', () => {
            // Connection errors are handled uniformly through 'close'.
        });
    });

    return server;
}