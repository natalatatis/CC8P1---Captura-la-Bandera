import dgram from 'node:dgram';
import { GameState } from './game/state.js';
import { createGameServer } from './network/gameSocket.js';
import { MESSAGE_MAX_SIZE } from './game/validator.js';

const TCP_HOST = '0.0.0.0';
const TCP_PORT = 8889;
const DISCOVERY_HOST = '0.0.0.0';
const DISCOVERY_PORT = 8888;
const SERVER_NAME = 'AASERVIDOR';
const PROTOCOL_VERSION = 1;

const gameState = new GameState();

// TCP GAME SERVER
 

const tcpServer = createGameServer(gameState);

tcpServer.on('error', (error) => {
    console.error('[TCP SERVER ERROR]', {
        code: error.code,
        message: error.message
    });
});

tcpServer.on('close', () => {
    console.log('[TCP SERVER] Server closed.');
});

tcpServer.listen(TCP_PORT, TCP_HOST, () => {
    const address = tcpServer.address();

    console.log('================================================');
    console.log('[TCP SERVER] Game server started');
    console.log(`[TCP SERVER] Listening address: ${address.address}`);
    console.log(`[TCP SERVER] Listening port: ${address.port}`);
    console.log(`[TCP SERVER] Address family: ${address.family}`);
    console.log('[TCP SERVER] Accepting connections on all IPv4 interfaces.');
    console.log('================================================');
});

/*
 * ============================================================
 * UDP DISCOVERY SERVER
 * ============================================================
 *
 * The protocol requires:
 *
 * - UDP port 8888.
 * - SO_REUSEADDR.
 * - Invalid JSON must be ignored silently.
 * - A version different from 1 must be ignored silently.
 * - The response must be sent directly to the requesting client.
 */

const udpServer = dgram.createSocket({
    type: 'udp4',
    reuseAddr: true
});

udpServer.on('error', (error) => {
    console.error('[UDP SERVER ERROR]', {
        code: error.code,
        message: error.message
    });
});

udpServer.on('listening', () => {
    const address = udpServer.address();

    console.log('================================================');
    console.log('[UDP SERVER] Discovery server started');
    console.log(`[UDP SERVER] Listening address: ${address.address}`);
    console.log(`[UDP SERVER] Listening port: ${address.port}`);
    console.log('[UDP SERVER] Waiting for discover messages.');
    console.log('================================================');
});

udpServer.on('message', (messageBuffer, remoteInfo) => {
    /*
     * UDP packets larger than message_max_size are silently discarded.
     */
    if (messageBuffer.length > MESSAGE_MAX_SIZE) {
        console.warn(
            `[UDP SERVER] Oversized datagram ignored from ` +
            `${remoteInfo.address}:${remoteInfo.port}`
        );
        return;
    }

    let message;

    try {
        message = JSON.parse(messageBuffer.toString('utf8'));
    } catch {
        /*
         * Invalid UDP JSON must be discarded silently according to the
         * protocol. We only log it locally for debugging.
         */
        console.warn(
            `[UDP SERVER] Invalid JSON ignored from ` +
            `${remoteInfo.address}:${remoteInfo.port}`
        );
        return;
    }

    if (
        message === null ||
        typeof message !== 'object' ||
        Array.isArray(message)
    ) {
        return;
    }

    /*
     * Wrong message type or protocol version is silently ignored.
     */
    if (
        message.type !== 'discover' ||
        message.v !== PROTOCOL_VERSION
    ) {
        return;
    }

    console.log(
        `[UDP SERVER] Valid discover received from ` +
        `${remoteInfo.address}:${remoteInfo.port}`
    );

    const serverInfo = {
        type: 'server_info',
        v: PROTOCOL_VERSION,
        name: SERVER_NAME,
        tcp_port: TCP_PORT,
        state: gameState.phase === 'lobby' ? 'lobby' : 'playing',
        players: gameState.players.size
    };

    const responseBuffer = Buffer.from(
        JSON.stringify(serverInfo),
        'utf8'
    );

    /*
     * Discovery responses are unicast directly to the address and source
     * port from which the discover request arrived.
     */
    udpServer.send(
        responseBuffer,
        0,
        responseBuffer.length,
        remoteInfo.port,
        remoteInfo.address,
        (error) => {
            if (error) {
                console.error(
                    `[UDP SERVER] Could not respond to ` +
                    `${remoteInfo.address}:${remoteInfo.port}:`,
                    error.message
                );
                return;
            }

            console.log(
                `[UDP SERVER] server_info sent to ` +
                `${remoteInfo.address}:${remoteInfo.port}`,
                serverInfo
            );
        }
    );
});

udpServer.bind(DISCOVERY_PORT, DISCOVERY_HOST);

//GAME LOOP
const tickIntervalMilliseconds = 1000 / gameState.TICK_RATE;

const gameLoop = setInterval(() => {
    try {
        gameState.update(1 / gameState.TICK_RATE);
    } catch (error) {
        console.error('[GAME LOOP ERROR]', error);
    }
}, tickIntervalMilliseconds);

//GRACEFUL SHUTDOWN


function shutdown(signal) {
    console.log(`\n[SERVER] Received ${signal}. Closing server...`);

    clearInterval(gameLoop);

    udpServer.close(() => {
        console.log('[UDP SERVER] Closed.');
    });

    tcpServer.close(() => {
        console.log('[TCP SERVER] Closed.');
        process.exit(0);
    });

    /*
     * Force exit if open sockets prevent the normal close callback.
     */
    setTimeout(() => {
        console.warn('[SERVER] Forced shutdown.');
        process.exit(1);
    }, 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));