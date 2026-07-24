import { SceneManager } from './SceneManager.js';
import { Player } from './Player.js';
import { InputHandler } from './inputHandler.js';
import { NetworkClient } from './Network.js';

// ---- DOM references (menu + HUD) ----
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const nameInput = document.getElementById('playerName');
const serverListEl = document.getElementById('serverList');
const serverListEmptyEl = document.getElementById('serverListEmpty');
const manualIpInput = document.getElementById('manualIp');
const manualPortInput = document.getElementById('manualPort');
const manualConnectBtn = document.getElementById('manualConnectBtn');
const menuStatusEl = document.getElementById('menuStatus');
const countdownEl = document.getElementById('countdownOverlay');
const gameOverEl = document.getElementById('gameOverOverlay');
const lobbyInfoEl = document.getElementById('lobbyInfo');

// ---- Game state ----
let sceneManager = null;
let inputHandler = null;
let myPlayerId = null;
let config = null;
const players = new Map(); // player_id -> Player instance
let lastSentDir = { x: 0, y: 0 };
let phase = 'lobby';

function setStatus(text) {
    menuStatusEl.textContent = text;
}

// ---- Bridge connection 
const net = new NetworkClient('ws://localhost:8890');

net.on('open', () => {
    setStatus('Conectado al bridge local. Buscando servidores...');
    net.discover();
});

net.on('close', () => setStatus('Se perdió la conexión con el bridge local (¿está corriendo "npm run bridge"?)'));

net.on('server_list', (msg) => {
    serverListEl.innerHTML = '';
    if (!msg.servers || msg.servers.length === 0) return;
    serverListEmptyEl.classList.add('hidden');

    for (const s of msg.servers) {
        const li = document.createElement('li');
        li.textContent = `${s.name} — ${s.ip}:${s.tcp_port} (${s.state}, ${s.players} jugadores)`;
        li.addEventListener('click', () => attemptConnect(s.ip, s.tcp_port));
        serverListEl.appendChild(li);
    }
});

manualConnectBtn.addEventListener('click', () => {
    const ip = manualIpInput.value.trim();
    const port = parseInt(manualPortInput.value.trim(), 10);
    if (!ip || !port) {
        setStatus('Ingresa una IP y un puerto TCP válidos.');
        return;
    }
    attemptConnect(ip, port);
});

function attemptConnect(ip, tcp_port) {
    setStatus(`Conectando a ${ip}:${tcp_port}...`);
    net.connectTo(ip, tcp_port);
}

net.on('bridge_connected', () => {
    const name = nameInput.value.trim() || `Jugador_${Math.floor(Math.random() * 1000)}`;
    setStatus('Conectado. Uniéndose a la partida...');
    net.join(name);
});

net.on('bridge_disconnected', () => {
    setStatus('El servidor cerró la conexión.');
});

net.on('error', (msg) => {
    setStatus(`Error: ${msg.reason || msg.detail || 'desconocido'}`);
});

// ---- Protocol messages from the real game server (relayed by the bridge) ----
net.on('welcome', (msg) => {
    myPlayerId = msg.player_id;
    config = msg.config;
    setStatus(`¡Bienvenido! Esperando en el lobby...`);
    startScene();
});

net.on('lobby', (msg) => {
    if (!hudEl.classList.contains('hidden')) {
        lobbyInfoEl.classList.remove('hidden');
        lobbyInfoEl.textContent = `Lobby: ${msg.players.length} jugador(es) esperando`;
    }
});

net.on('countdown', (msg) => {
    phase = 'countdown';
    lobbyInfoEl.classList.add('hidden');
    countdownEl.classList.remove('hidden');
    countdownEl.textContent = msg.seconds > 0 ? String(msg.seconds) : '¡Ya!';
});

net.on('start', () => {
    phase = 'playing';
    countdownEl.classList.add('hidden');
});

net.on('state', (msg) => {
    syncPlayers(msg.players);
    if (sceneManager) {
        sceneManager.updateFlag(msg.flag.x, msg.flag.y, msg.flag.owner);
    }
});

net.on('game_over', (msg) => {
    phase = 'finished';
    const winnerName = msg.winner === myPlayerId ? '¡Ganaste!' : `Ganó: ${msg.winner}`;
    gameOverEl.classList.remove('hidden');
    gameOverEl.textContent = winnerName;
});

// ---- Scene / render setup, created once we've joined ----
function startScene() {
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');

    sceneManager = new SceneManager();
    inputHandler = new InputHandler(() => net.interact());

    animate();
    startInputLoop();
}

function syncPlayers(serverPlayers) {
    const seen = new Set();

    for (const p of serverPlayers) {
        seen.add(p.id);
        let player = players.get(p.id);
        if (!player) {
            player = new Player(p.id, p.id === myPlayerId);
            players.set(p.id, player);
            sceneManager.addPlayer(player);
        }
        player.updatePosition(p.x, p.y, sceneManager);
    }

    // Remove players no longer present in the server snapshot (disconnected).
    for (const [id, player] of players.entries()) {
        if (!seen.has(id)) {
            sceneManager.removePlayer(player);
            players.delete(id);
        }
    }
}

// Send movement intent at a fixed rate, only while actually playing,
// and only when it changed (keeps traffic light).
function startInputLoop() {
    setInterval(() => {
        if (phase !== 'playing' || !inputHandler) return;
        const dir = inputHandler.getDirection();
        if (dir.x !== lastSentDir.x || dir.y !== lastSentDir.y) {
            lastSentDir = dir;
            net.input(dir.x, dir.y);
        }
    }, 50); // 20 times/second, matching the server tick_rate
}

function animate() {
    requestAnimationFrame(animate);
    if (sceneManager) sceneManager.render();
}