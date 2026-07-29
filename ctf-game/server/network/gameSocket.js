import crypto from 'node:crypto';
import net from 'node:net';
import { MessageParser } from '../../protocol/parser.js';
import {
    MESSAGE_MAX_SIZE,
    NAME_MAX_LENGTH
} from '../game/validator.js';

const PROTOCOL_VERSION = 1;

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/*
 * Safely sends one compact JSON message followed by exactly one newline.
 */
function sendMsg(socket, message) {
    if (!socket || socket.destroyed || !socket.writable) {
        console.warn(
            '[TCP SEND] Message not sent because socket is unavailable:',
            message
        );

        return false;
    }

    const wireMessage = JSON.stringify(message) + '\n';

    socket.write(wireMessage, 'utf8', (error) => {
        if (error) {
            console.error('[TCP SEND ERROR]', {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                type: message.type,
                message: error.message
            });
        }
    });

    console.log(
        `[TCP SEND] ${socket.remoteAddress}:${socket.remotePort} ` +
        `type=${message.type}`
    );

    return true;
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}

function isValidPlayerName(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmedName = value.trim();

    return (
        trimmedName.length >= 1 &&
        trimmedName.length <= NAME_MAX_LENGTH &&
        !CONTROL_CHARS_RE.test(trimmedName)
    );
}

function isValidDirectionValue(value) {
    return (
        Number.isInteger(value) &&
        value >= -1 &&
        value <= 1
    );
}

export function createGameServer(gameState) {
    /*
     * Only joined sessions are stored here. A socket is not included in
     * broadcasts until its valid join has been accepted.
     */
    const joinedSockets = new Map();

    function broadcast(message) {
        console.log(
            `[TCP BROADCAST] type=${message.type}, ` +
            `recipients=${joinedSockets.size}`
        );

        for (const socket of joinedSockets.values()) {
            sendMsg(socket, message);
        }
    }

    gameState.on('lobby', broadcast);
    gameState.on('countdown', broadcast);
    gameState.on('start', broadcast);
    gameState.on('state', broadcast);
    gameState.on('game_over', broadcast);

    const server = net.createServer((socket) => {
        socket.setNoDelay(true);

        console.log('================================================');
        console.log('[TCP CONNECTION] New connection');
        console.log(
            `[TCP CONNECTION] Remote: ` +
            `${socket.remoteAddress}:${socket.remotePort}`
        );
        console.log(
            `[TCP CONNECTION] Local: ` +
            `${socket.localAddress}:${socket.localPort}`
        );
        console.log('================================================');

        const parser = new MessageParser(MESSAGE_MAX_SIZE);

        let playerId = null;
        let isSpectator = false;
        let cleanedUp = false;

        function cleanupSession() {
            if (cleanedUp) {
                return;
            }

            cleanedUp = true;

            if (!playerId) {
                return;
            }

            joinedSockets.delete(playerId);

            if (!isSpectator) {
                gameState.removePlayer(playerId);
            }

            console.log(
                `[TCP CONNECTION] Session removed: ${playerId}`
            );
        }

        function sendError(reason) {
            sendMsg(socket, {
                type: 'error',
                reason
            });
        }

        function closeAfterError(reason) {
            sendError(reason);

            /*
             * socket.end() sends the pending error message and then performs
             * an orderly TCP close.
             */
            socket.end();
        }

        socket.on('data', (chunk) => {
            console.log(
                `[TCP RECEIVE] ${chunk.length} bytes from ` +
                `${socket.remoteAddress}:${socket.remotePort}`
            );

            console.log(
                '[TCP RECEIVE] Raw data:',
                JSON.stringify(chunk.toString('utf8'))
            );

            let messages;

            try {
                messages = parser.feed(chunk);
            } catch (error) {
                console.error('[TCP PARSER ERROR]', error);

                sendError('INVALID_JSON');
                return;
            }

            console.log(
                `[TCP RECEIVE] Complete messages parsed: ` +
                `${messages.length}`
            );

            for (const message of messages) {
                if (message.__fatal) {
                    console.warn(
                        '[TCP PROTOCOL] Fatal parser result:',
                        message.reason
                    );

                    closeAfterError(message.reason);
                    return;
                }

                processClientMessage(message);

                if (socket.destroyed) {
                    return;
                }
            }
        });

        function processClientMessage(message) {
            console.log('[TCP MESSAGE] Received:', message);

            if (!isPlainObject(message)) {
                sendError('INVALID_JSON');
                return;
            }

            if (!Object.hasOwn(message, 'type')) {
                sendError('MISSING_FIELD');
                return;
            }

            if (typeof message.type !== 'string') {
                sendError('INVALID_FIELD');
                return;
            }

            switch (message.type) {
                case 'join':
                    handleJoin(message);
                    break;

                case 'input':
                    handleInput(message);
                    break;

                case 'interact':
                    handleInteract();
                    break;

                case 'start_game':
                    handleStartGame();
                    break;

                default:
                    sendError('UNKNOWN_TYPE');
                    break;
            }
        }

        function handleJoin(message) {
            console.log('[JOIN] Request received:', message);
            console.log(`[JOIN] Current phase: ${gameState.phase}`);

            /*
             * A second join on the same connection is rejected without
             * closing the connection.
             */
            if (playerId !== null) {
                console.warn('[JOIN] Rejected: duplicate join.');
                sendError('INVALID_PHASE');
                return;
            }

            if (!Object.hasOwn(message, 'v')) {
                sendError('MISSING_FIELD');
                return;
            }

            if (!Object.hasOwn(message, 'name')) {
                sendError('MISSING_FIELD');
                return;
            }

            if (!Number.isInteger(message.v)) {
                sendError('INVALID_FIELD');
                return;
            }

            if (message.v !== PROTOCOL_VERSION) {
                console.warn(
                    `[JOIN] Version mismatch: received ${message.v}`
                );

                closeAfterError('VERSION_MISMATCH');
                return;
            }

            /*
             * This is an optional local extension. Standard clients will not
             * send it, and unknown fields are allowed by the protocol.
             */
            const wantsSpectator = message.spectator === true;

            if (!wantsSpectator) {
                if (gameState.phase !== 'lobby') {
                    console.warn(
                        '[JOIN] Rejected because game already started.'
                    );

                    closeAfterError('GAME_STARTED');
                    return;
                }

                if (gameState.isFull()) {
                    console.warn('[JOIN] Rejected because lobby is full.');

                    closeAfterError('LOBBY_FULL');
                    return;
                }
            }

            if (typeof message.name !== 'string') {
                sendError('INVALID_FIELD');
                return;
            }

            if (!isValidPlayerName(message.name)) {
                sendError('NAME_INVALID');
                return;
            }

            const trimmedName = message.name.trim();

            playerId = crypto.randomUUID();
            isSpectator = wantsSpectator;

            joinedSockets.set(playerId, socket);

            console.log('[JOIN] Accepted');
            console.log(`[JOIN] Player ID: ${playerId}`);
            console.log(`[JOIN] Player name: ${trimmedName}`);
            console.log(`[JOIN] Spectator: ${isSpectator}`);

            /*
             * Welcome must reach the newly joined client before the lobby
             * broadcast triggered by addPlayer().
             */
            sendMsg(socket, {
                type: 'welcome',
                player_id: playerId,
                config: {
                    map_size: 1000,
                    circle_radius: 300,
                    player_radius: 15,
                    interact_radius: 40,
                    speed: 200,
                    tick_rate: 20
                }
            });

            console.log(`[JOIN] welcome sent to ${playerId}`);

            if (!isSpectator) {
                gameState.addPlayer(playerId, trimmedName);
            }
        }

        function handleInput(message) {
            if (!playerId) {
                sendError('NOT_JOINED');
                return;
            }

            if (isSpectator) {
                sendError('INVALID_PHASE');
                return;
            }

            if (gameState.phase !== 'playing') {
                sendError('INVALID_PHASE');
                return;
            }

            if (!Object.hasOwn(message, 'dir')) {
                sendError('MISSING_FIELD');
                return;
            }

            if (!isPlainObject(message.dir)) {
                sendError('INVALID_FIELD');
                return;
            }

            if (
                !Object.hasOwn(message.dir, 'x') ||
                !Object.hasOwn(message.dir, 'y')
            ) {
                sendError('MISSING_FIELD');
                return;
            }

            if (
                !isValidDirectionValue(message.dir.x) ||
                !isValidDirectionValue(message.dir.y)
            ) {
                sendError('INVALID_FIELD');
                return;
            }

            gameState.setPlayerInput(
                playerId,
                message.dir.x,
                message.dir.y
            );

            console.log(
                `[INPUT] Player ${playerId}: ` +
                `(${message.dir.x}, ${message.dir.y})`
            );
        }

        function handleStartGame() {
            if (!playerId) {
                sendError('NOT_JOINED');
                return;
            }

            // Only the local host/observer connection is allowed to start.
            // Regular players cannot force the match to begin.
            if (!isSpectator) {
                sendError('HOST_ONLY');
                return;
            }

            const result = gameState.requestStart();

            if (!result.ok) {
                sendError(result.reason);
                return;
            }

            console.log(
                `[HOST] Start accepted from ${playerId}; ` +
                `${gameState.players.size} players in lobby.`
            );
        }

        function handleInteract() {
            if (!playerId) {
                sendError('NOT_JOINED');
                return;
            }

            if (isSpectator) {
                sendError('INVALID_PHASE');
                return;
            }

            if (gameState.phase !== 'playing') {
                sendError('INVALID_PHASE');
                return;
            }

            /*
             * GameState resolves interactions after movement and victory,
             * preserving TCP arrival order.
             */
            gameState.queueInteract(playerId);

            console.log(
                `[INTERACT] Interaction queued for ${playerId}`
            );
        }

        socket.on('end', () => {
            console.log(
                `[TCP CONNECTION] Client ended connection: ` +
                `${socket.remoteAddress}:${socket.remotePort}`
            );
        });

        socket.on('close', (hadError) => {
            console.log(
                `[TCP CONNECTION] Closed: ` +
                `${socket.remoteAddress}:${socket.remotePort}, ` +
                `playerId=${playerId ?? 'not joined'}, ` +
                `hadError=${hadError}`
            );

            cleanupSession();
        });

        socket.on('error', (error) => {
            console.error('[TCP SOCKET ERROR]', {
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                playerId,
                code: error.code,
                message: error.message
            });
        });
    });

    return server;
}