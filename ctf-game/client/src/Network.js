
export class NetworkClient {
    constructor(bridgeUrl = 'ws://localhost:8890') {
        this.handlers = {};
        this.socket = new WebSocket(bridgeUrl);

        this.socket.addEventListener('open', () => this._emit('open', {}));
        this.socket.addEventListener('close', () => this._emit('close', {}));
        this.socket.addEventListener('error', (e) => this._emit('socket_error', e));
        this.socket.addEventListener('message', (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (msg && typeof msg.type === 'string') this._emit(msg.type, msg);
        });
    }

    on(type, callback) {
        (this.handlers[type] ??= []).push(callback);
        return this;
    }

    _emit(type, payload) {
        for (const cb of this.handlers[type] || []) cb(payload);
    }

    _send(obj) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(obj));
        }
    }

    // Ask the bridge to run UDP broadcast discovery (1.3) on our behalf.
    discover() {
        this._send({ type: 'discover_local' });
    }

    // Ask the bridge to open the real TCP game connection to a chosen server.
    connectTo(ip, tcp_port) {
        this._send({ type: 'connect', ip, tcp_port });
    }

    join(name) {
        this._send({ type: 'join', v: 1, name });
    }

    input(x, y) {
        this._send({ type: 'input', dir: { x, y } });
    }

    interact() {
        this._send({ type: 'interact' });
    }
}