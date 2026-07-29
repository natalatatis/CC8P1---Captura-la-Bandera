export class NetworkClient {
    constructor(url) {
        this.url = url;
        this.handlers = new Map();
        this.socket = new WebSocket(url);

        this.socket.addEventListener('open', () => {
            this.emit('open');
        });

        this.socket.addEventListener('close', () => {
            this.emit('close');
        });

        this.socket.addEventListener('error', () => {
            this.emit('error', {
                type: 'error',
                reason: 'BRIDGE_ERROR'
            });
        });

        this.socket.addEventListener('message', (event) => {
            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                this.emit('error', {
                    type: 'error',
                    reason: 'INVALID_JSON'
                });
                return;
            }

            if (message && typeof message.type === 'string') {
                this.emit(message.type, message);
            }
        });
    }

    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }

        this.handlers.get(type).push(handler);
    }

    emit(type, message) {
        for (const handler of this.handlers.get(type) || []) {
            handler(message);
        }
    }

    send(message) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            this.emit('error', {
                type: 'error',
                reason: 'BRIDGE_NOT_CONNECTED'
            });
            return false;
        }

        this.socket.send(JSON.stringify(message));
        return true;
    }

    discover() {
        this.send({ type: 'discover_local' });
    }

    discoverManual(ip) {
        this.send({ type: 'discover_manual', ip });
    }

    connectTo(ip, tcpPort) {
        this.send({
            type: 'connect',
            ip,
            tcp_port: Number(tcpPort)
        });
    }

    disconnect() {
        this.send({ type: 'disconnect' });
    }

    join(name, spectator = false) {
        this.send({
            type: 'join',
            v: 1,
            name,
            spectator
        });
    }

    startGame() {
        this.send({ type: 'start_game' });
    }

    input(x, y) {
        this.send({
            type: 'input',
            dir: { x, y }
        });
    }

    interact() {
        this.send({ type: 'interact' });
    }
}
