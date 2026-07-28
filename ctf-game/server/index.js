import { GameState } from './game/state.js';
import { createGameServer } from './network/gameSocket.js';
import dgram from 'node:dgram';

const gameState = new GameState();
const TCP_PORT = 8889; // choose any dynamic game port
const DISCOVERY_PORT = 8888; // fixed discovery port per protocol (section 1.2)

// Start TCP Game Server
const tcpServer = createGameServer(gameState);
tcpServer.listen(TCP_PORT, () => {
    console.log(`Servidor TCP de juego escuchando en puerto ${TCP_PORT}`);
});

// Start UDP Discovery Responder (section 1.3).
// reuseAddr lets us survive quick restarts / multiple local test processes,
// as required by the spec ("SO_REUSEADDR ... para tolerar reinicios
// rápidos"). Node's dgram module doesn't expose SO_REUSEPORT directly.
const udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udpServer.bind(DISCOVERY_PORT, () => {
    udpServer.setBroadcast(true);
    console.log(`Servidor UDP de descubrimiento escuchando en puerto ${DISCOVERY_PORT}`);
});

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString('utf8'));

        // A discover with a different v, or invalid JSON, is silently
        // discarded (no response) — section 1.3.
        if (data.type === 'discover' && data.v === 1) {
            const response = JSON.stringify({
                type: 'server_info',
                v: 1,
                name: 'AASERVIDOR',
                tcp_port: TCP_PORT,
                // Only "lobby" (accepting new players right now) or
                // "playing" (anything else: countdown, in-progress, or the
                // post-game pause) — section 1.3.
                state: gameState.phase === 'lobby' ? 'lobby' : 'playing',
                players: gameState.players.size
            });
            const reply = Buffer.from(response);
            udpServer.send(reply, 0, reply.length, rinfo.port, rinfo.address);
        }
    } catch (e) {
        // Not valid JSON: discarded silently, no connection to reply an error on.
    }
});

// Main Game Loop (20 ticks per second)
const TICK_INTERVAL = 1000 / gameState.TICK_RATE;
setInterval(() => {
    gameState.update(1 / gameState.TICK_RATE);
}, TICK_INTERVAL);