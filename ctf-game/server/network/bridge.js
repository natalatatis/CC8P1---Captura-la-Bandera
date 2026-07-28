// WHY THIS FILE EXISTS
// ---------------------
// The class protocol requires plain TCP sockets and plain UDP
// sockets for the actual match traffic, with no external connection library
// (no `ws`) — that rule is about wire-compatibility between the 16 projects.
//
// The problem: a browser tab can NEVER open a raw TCP or UDP socket. That is
// not a library limitation, it's a browser sandboxing rule with no
// workaround — `net.Socket`/`dgram` simply don't exist in browser JS, and no
// npm package changes that.
//
// The fix: keep the network protocol between servers 100% pure TCP/UDP as
// specified, and run it from Node (this bridge), not from the browser. The
// only thing that talks to the browser is a local, same-machine WebSocket
// that never touches another team's server and is not part of the graded
// protocol — it only exists to get bytes from Node into the tab so Three.js
// can draw them. Everything this bridge sends/receives to the real game
// server on the wire is exactly the same TCP/UDP + JSON + '\n' framing the
// standard requires.
//
//        Browser (Three.js/Vite)  <--ws (localhost only)-->  This bridge (Node)  <--TCP/UDP, protocol-compliant-->  Real CTF server
//
import { WebSocketServer } from 'ws';
import net from 'node:net';
import dgram from 'node:dgram';
import os from 'node:os';
import { MessageParser } from '../../protocol/parser.js';
import { MESSAGE_MAX_SIZE } from '../game/validator.js';

const BRIDGE_PORT = 8890;       // local only, browser <-> bridge
const DISCOVERY_PORT = 8888;    // fixed by protocol 1.2
const LIMITED_BROADCAST = '255.255.255.255';
const MANUAL_DISCOVER_TIMEOUT_MS = 3000;

const VIRTUAL_IFACE_RE = /virtualbox|vmware|hyper-v|vethernet|docker|wsl|loopback|tailscale|utun|tun\d|tap\d/i;

function getSubnetBroadcastAddresses() {
    const addresses = [];
    const interfaces = os.networkInterfaces();

    for (const [ifaceName, entries] of Object.entries(interfaces)) {
        console.log(ifaceName);   // <-- add this

        if (VIRTUAL_IFACE_RE.test(ifaceName)) continue;

        for (const entry of entries || []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;

            console.log(`  ${entry.address} / ${entry.netmask}`);

            const ipParts = entry.address.split('.').map(Number);
            const maskParts = entry.netmask.split('.').map(Number);
            const broadcastParts = ipParts.map((octet, i) =>
                (octet | (~maskParts[i] & 0xff)) & 0xff
            );

            addresses.push(broadcastParts.join('.'));
        }
    }

    return addresses;
}

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

        // Manual fallback (spec 1.3, "vía Manual"): when broadcast doesn't
        // reach the other machine (blocked/isolated router, e.g. many
        // mobile hotspots isolate connected clients from each other), the
        // person only needs to know the server's IP. We send the same
        // `discover` message by UDP unicast straight to IP:8888 instead of
        // broadcasting it, and wait for that one server's `server_info`
        // reply to learn its TCP port dynamically — no need to know or
        // type the port by hand.
        if (msg.type === 'discover_manual') {
            discoverManual(msg.ip);
            return;
        }

        if (msg.type === 'connect') {
            connectToServer(msg.ip, msg.tcp_port);
            return;
        }

        // Explicit disconnect requested by the client (e.g. after a round
        // ends and the person returns to the connection screen): tear down
        // the TCP session to the real game server without closing the
        // browser<->bridge WebSocket. The server sees a normal TCP close
        // (section 5.2) and removes the player; no protocol message is
        // needed for this. The person must choose/press a server again to
        // start a new session.
        if (msg.type === 'disconnect') {
            if (tcpSocket) tcpSocket.destroy();
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
                    const key = `${data.name}:${data.tcp_port}:${data.state}`;
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
            udpClient.setBroadcast(true); // SO_BROADCAST — required before sending, per spec 1.3
            const discoverMsg = Buffer.from(JSON.stringify({ type: 'discover', v: 1 }));
            const broadcastOnce = () => {
                const targets = new Set([LIMITED_BROADCAST, ...getSubnetBroadcastAddresses()]);
                for (const address of targets) {
                    udpClient.send(discoverMsg, 0, discoverMsg.length, DISCOVERY_PORT, address);
                }
            };
            broadcastOnce();
            discoveryInterval = setInterval(broadcastOnce, 3000);
        });
    }

    function connectToServer(ip, tcpPort) {
        if (tcpSocket) tcpSocket.destroy();

        parser = new MessageParser(MESSAGE_MAX_SIZE);
        tcpSocket = new net.Socket();

        tcpSocket.connect(tcpPort, ip, () => {
            send({ type: 'bridge_connected', ip, tcp_port: tcpPort });
        });

        tcpSocket.on('data', (chunk) => {
            const messages = parser.feed(chunk);
            for (const m of messages) {
                send(m.__fatal ? { type: 'error', reason: m.reason } : m);
                if (m.__fatal) { tcpSocket.destroy(); return; }
            }
        });

        tcpSocket.on('close', () => send({ type: 'bridge_disconnected' }));
        tcpSocket.on('error', (err) => send({ type: 'error', reason: 'TCP_ERROR', detail: err.message }));
    }

    // Manual unicast discovery (spec 1.3): same `discover` message as the
    // broadcast path, but sent straight to one IP:8888. We don't know this
    // server's TCP port in advance either — that's exactly what its
    // `server_info` reply tells us, the same as with broadcast discovery.
    function discoverManual(ip) {
        if (!ip) {
            send({ type: 'error', reason: 'INVALID_FIELD', detail: 'ip requerida' });
            return;
        }

        const sock = dgram.createSocket('udp4');
        const discoverMsg = Buffer.from(JSON.stringify({ type: 'discover', v: 1 }));
        let done = false;

        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            sock.close();
        };

        sock.on('message', (m) => {
            try {
                const data = JSON.parse(m.toString('utf8'));
                if (data.type === 'server_info' && data.v === 1) {
                    send({
                        type: 'server_list',
                        servers: [{ name: data.name, ip, tcp_port: data.tcp_port, state: data.state, players: data.players }]
                    });
                }
            } catch {
                // ignore malformed reply
            } finally {
                finish();
            }
        });

        sock.on('error', (err) => {
            send({ type: 'error', reason: 'DISCOVERY_ERROR', detail: err.message });
            finish();
        });

        const timer = setTimeout(() => {
            send({ type: 'error', reason: 'DISCOVERY_ERROR', detail: `Sin respuesta de ${ip}:8888` });
            finish();
        }, MANUAL_DISCOVER_TIMEOUT_MS);

        sock.send(discoverMsg, 0, discoverMsg.length, DISCOVERY_PORT, ip);
    }

    ws.on('close', () => {
        if (tcpSocket) tcpSocket.destroy();
        if (udpClient) {
            clearInterval(discoveryInterval);
            udpClient.close();
        }
    });
});