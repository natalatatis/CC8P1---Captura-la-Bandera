import net from 'node:net';
import crypto from 'node:crypto';
import { MessageParser } from '../../protocol/parser.js';

export function createGameServer(gameState) {
    const server = net.createServer((socket) => {
        const parser = new MessageParser();
        let playerId = null;

        socket.on('data', (chunk) => {
            const messages = parser.feed(chunk);

            for (const msg of messages) {
                // Rule: Every message must include a "type" field
                if (!msg || typeof msg.type !== 'string') {
                    socket.write(JSON.stringify({ type: 'error', reason: 'MISSING_FIELD' }) + '\n');
                    continue;
                }

                switch (msg.type) {
                    case 'join':
                        if (gameState.phase !== 'lobby') {
                            socket.write(JSON.stringify({ type: 'error', reason: 'INVALID_PHASE' }) + '\n');
                            break;
                        }
                        if (msg.v !== 1) {
                            socket.write(JSON.stringify({ type: 'error', reason: 'VERSION_MISMATCH' }) + '\n');
                            socket.end();
                            break;
                        }
                        if (!msg.name || typeof msg.name !== 'string' || msg.name.trim().length === 0 || msg.name.length > 20) {
                            socket.write(JSON.stringify({ type: 'error', reason: 'NAME_INVALID' }) + '\n');
                            break;
                        }

                        playerId = crypto.randomUUID();
                        gameState.addPlayer(playerId, msg.name.trim());

                        // Send welcome message back containing ID and config constants
                        socket.write(JSON.stringify({
                            type: 'welcome',
                            player_id: playerId,
                            config: {
                                map_size: gameState.MAP_SIZE,
                                circle_radius: gameState.CIRCLE_RADIUS,
                                player_radius: 15,
                                interact_radius: 40,
                                speed: 200,
                                tick_rate: 20
                            }
                        }) + '\n');
                        break;

                    case 'input':
                        if (gameState.phase !== 'playing') break;
                        if (!playerId) {
                            socket.write(JSON.stringify({ type: 'error', reason: 'NOT_JOINED' }) + '\n');
                            break;
                        }
                        if (msg.dir && typeof msg.dir.x === 'number' && typeof msg.dir.y === 'number') {
                            gameState.setPlayerInput(playerId, msg.dir.x, msg.dir.y);
                        } else {
                            socket.write(JSON.stringify({ type: 'error', reason: 'INVALID_FIELD' }) + '\n');
                        }
                        break;

                    case 'interact':
                        if (gameState.phase !== 'playing') break;
                        if (!playerId) {
                            socket.write(JSON.stringify({ type: 'error', reason: 'NOT_JOINED' }) + '\n');
                            break;
                        }
                        gameState.handleInteract(playerId);
                        break;

                    default:
                        socket.write(JSON.stringify({ type: 'error', reason: 'UNKNOWN_TYPE' }) + '\n');
                        break;
                }
            }
        });

        socket.on('close', () => {
            if (playerId) {
                gameState.removePlayer(playerId);
            }
        });

        socket.on('error', (err) => {
            // Handle socket error silently or log if needed
        });
    });

    return server;
}