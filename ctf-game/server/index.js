import { GameState } from './game/state.js';
import { createGameServer } from './network/gameSocket.js';
import dgram from 'node:dgram';

const gameState = new GameState();
const TCP_PORT = 8889; //  choose any dynamic game port
const DISCOVERY_PORT = 8888; // Fixed discovery port per protocol

//  Start TCP Game Server
const tcpServer = createGameServer(gameState);
tcpServer.listen(TCP_PORT, () => {
    console.log(`Servidor TCP de juego escuchando en puerto ${TCP_PORT}`);
});

//  Start UDP Discovery Responder (per protocol spec)
const udpServer = dgram.createSocket('udp4');
udpServer.bind(DISCOVERY_PORT, () => {
    udpServer.setBroadcast(true);
    console.log(`Servidor UDP de descubrimiento escuchando en puerto ${DISCOVERY_PORT}`);
});

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString('utf8'));
        if (data.type === 'discover' && data.v === 1) {
            const response = JSON.stringify({
                type: 'server_info',
                v: 1,
                name: 'Mi Servidor CTF',
                tcp_port: TCP_PORT,
                state: gameState.phase,
                players: gameState.players.size
            });
            const reply = Buffer.from(response);
            udpServer.send(reply, 0, reply.length, rinfo.port, rinfo.address);
        }
    } catch (e) {
        // Ignorar paquetes no válidos
    }
});

//  Main Game Loop (20 ticks per second)
const TICK_INTERVAL = 1000 / gameState.TICK_RATE;
setInterval(() => {
    gameState.update(1 / gameState.TICK_RATE);
}, TICK_INTERVAL);