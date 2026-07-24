//        Browser (Three.js/Vite)  <--ws (localhost only)-->  This bridge (Node)  <--TCP/UDP, protocol-compliant-->  Real CTF server

import { WebSocketServer } from 'ws';
import net from 'node:net';
import dgram from 'node:dgram';
import { MessageParser } from '../../protocol/parser.js';

const BRIDGE_PORT = 8890;       // local only, browser <-> bridge
const DISCOVERY_PORT = 8888;    // fixed by protocol 
const BROADCAST_ADDRESS = '255.255.255.255';

const wss = new WebSocketServer({ port: BRIDGE_PORT });
console.log(`Bridge local en ws://localhost:${BRIDGE_PORT} (solo navegador <-> este proceso, no es parte del protocolo de clase)`);

wss.on('connection', (ws) => {
    let tcpSocket = null;
    let parser = null;
    let udpClient = null;
    let discoveryInterval = null;
    const foundServers = new Map();

    const send = (obj) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString('utf8'));
        } catch {
            send({ type: 'error', reason: 'INVALID_JSON' });
            return;
        }

        if (msg.type === 'discover_local') {
            startLocalDiscovery();
            return;
        }

        if (msg.type === 'connect') {
            connectToServer(msg.ip, msg.tcp_port);
            return;
        }

        // Anything else (join / input / interact) is forwarded verbatim,
        // as real protocol TCP traffic, to the actual game server.
        if (tcpSocket && !tcpSocket.destroyed) {
            tcpSocket.write(JSON.stringify(msg) + '\n');
        } else {
            send({ type: 'error', reason: 'NOT_JOINED' });
        }
    });

    function startLocalDiscovery() {
        if (udpClient) return; // already discovering
        udpClient = dgram.createSocket('udp4');

        udpClient.on('message', (m, rinfo) => {
            try {
                const data = JSON.parse(m.toString('utf8'));
                if (data.type === 'server_info' && data.v === 1) {
                    const key = `${rinfo.address}:${data.tcp_port}`;
                    foundServers.set(key, {
                        name: data.name,
                        ip: rinfo.address,
                        tcp_port: data.tcp_port,
                        state: data.state,
                        players: data.players
                    });
                    send({ type: 'server_list', servers: Array.from(foundServers.values()) });
                }
            } catch {
                // ignore malformed discovery packets
            }
        });

        udpClient.on('error', (err) => {
            send({ type: 'error', reason: 'DISCOVERY_ERROR', detail: err.message });
        });

        udpClient.bind(() => {
            udpClient.setBroadcast(true);
            const discoverMsg = Buffer.from(JSON.stringify({ type: 'discover', v: 1 }));
            const broadcastOnce = () => {
                udpClient.send(discoverMsg, 0, discoverMsg.length, DISCOVERY_PORT, BROADCAST_ADDRESS);
            };
            broadcastOnce();
            discoveryInterval = setInterval(broadcastOnce, 3000);
        });
    }

    function connectToServer(ip, tcpPort) {
        if (tcpSocket) tcpSocket.destroy();

        parser = new MessageParser();
        tcpSocket = new net.Socket();

        tcpSocket.connect(tcpPort, ip, () => {
            send({ type: 'bridge_connected', ip, tcp_port: tcpPort });
        });

        tcpSocket.on('data', (chunk) => {
            const messages = parser.feed(chunk);
            for (const m of messages) send(m);
        });

        tcpSocket.on('close', () => send({ type: 'bridge_disconnected' }));
        tcpSocket.on('error', (err) => send({ type: 'error', reason: 'TCP_ERROR', detail: err.message }));
    }

    ws.on('close', () => {
        if (tcpSocket) tcpSocket.destroy();
        if (udpClient) {
            clearInterval(discoveryInterval);
            udpClient.close();
        }
    });
});