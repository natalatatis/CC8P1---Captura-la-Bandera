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
const grabPromptEl = document.getElementById('grabPrompt');
const carryingBannerEl = document.getElementById('carryingBanner');
const squadRosterEl = document.getElementById('squadRoster');
const squadCountEl = document.getElementById('squadCount');

// ---- Game state ----
let sceneManager = null;
let inputHandler = null;
let myPlayerId = null;
let config = null;
const players = new Map(); // player_id -> Player instance
const playerNames = new Map(); // player_id -> name (from 'lobby' broadcasts)
let lastSentDir = { x: 0, y: 0 };
let phase = 'lobby';
let hasEnteredGame = false; // true once the 3D scene has been created (after 'start')

function setStatus(text) {
    menuStatusEl.textContent = text;
}

// ---- Bridge connection (local only, see Network.js / bridge.js) ----
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
    setStatus('¡Bienvenido! Esperando a que se complete el escuadrón...');
    // Stay on the menu — the server only moves to 'countdown'/'start' once
    // min_players (2) have joined (or, later, once the host starts it).
});

net.on('lobby', (msg) => {
    for (const p of msg.players) {
        playerNames.set(p.id, p.name);
        players.get(p.id)?.setName(p.name); // refresh nametag if already spawned
    }

    renderSquadRoster(msg.players);

    if (hasEnteredGame) {
        // The server sent 'lobby' after we'd already started playing — that
        // only happens when a countdown was aborted (someone left, dropping
        // below min_players) or the round just ended and the 5s post-game
        // pause finished. Either way, return to the menu without reconnecting.
        returnToLobbyScreen();
    }
});

function renderSquadRoster(rosterPlayers) {
    squadCountEl.textContent = String(rosterPlayers.length);
    squadRosterEl.innerHTML = '';

    for (const p of rosterPlayers) {
        const li = document.createElement('li');
        if (p.id === myPlayerId) li.classList.add('is-me');

        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = (p.name || '?').slice(0, 2).toUpperCase();

        const label = document.createElement('span');
        label.textContent = p.id === myPlayerId ? `${p.name} (tú)` : p.name;

        li.appendChild(avatar);
        li.appendChild(label);
        squadRosterEl.appendChild(li);
    }
}

function returnToLobbyScreen() {
    hasEnteredGame = false;
    phase = 'lobby';

    gameOverEl.classList.add('hidden');
    countdownEl.classList.add('hidden');
    grabPromptEl.classList.add('hidden');
    carryingBannerEl.classList.add('hidden');
    hudEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
    setStatus('De vuelta en la sala de espera.');

    for (const player of players.values()) sceneManager?.removePlayer(player);
    players.clear();
}

const menuCountdownEl = document.getElementById('menuCountdown');

net.on('countdown', (msg) => {
    phase = 'countdown';
    menuCountdownEl.classList.remove('hidden');
    menuCountdownEl.textContent = `La partida comienza en ${msg.seconds}...`;
});

net.on('start', () => {
    phase = 'playing';
    menuCountdownEl.classList.add('hidden');
    startScene();
});

net.on('state', (msg) => {
    syncPlayers(msg.players);
    if (sceneManager) {
        sceneManager.updateFlag(msg.flag.x, msg.flag.y, msg.flag.owner, players);
    }
    updateGrabPrompt(msg);
});

function updateGrabPrompt(msg) {
    const iHaveFlag = msg.flag.owner === myPlayerId;
    carryingBannerEl.classList.toggle('hidden', !iHaveFlag);

    const me = msg.players.find(p => p.id === myPlayerId);
    if (!me || iHaveFlag) {
        grabPromptEl.classList.add('hidden');
        return;
    }
    const radius = (config && config.interact_radius) || 40;
    const dx = me.x - msg.flag.x;
    const dy = me.y - msg.flag.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    grabPromptEl.classList.toggle('hidden', dist > radius);
}

net.on('game_over', (msg) => {
    phase = 'finished';
    grabPromptEl.classList.add('hidden');
    carryingBannerEl.classList.add('hidden');
    const winnerName = msg.winner === myPlayerId
        ? '¡Ganaste!'
        : `Ganó: ${playerNames.get(msg.winner) || msg.winner}`;
    gameOverEl.classList.remove('hidden');
    gameOverEl.textContent = winnerName;
});

// ---- Scene / render setup, created once we've joined ----
function startScene() {
    hasEnteredGame = true;
    document.activeElement?.blur();
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');

    // Rounds now repeat without reconnecting (server auto-returns to lobby
    // after game_over), so only build the scene/input/loops once and reuse
    // them — otherwise we'd stack a second WebGL canvas and a second set of
    // keyboard listeners on every subsequent round.
    if (!sceneManager) {
        sceneManager = new SceneManager();
        inputHandler = new InputHandler(() => net.interact());
        animate();
        startInputLoop();
    }
}

function syncPlayers(serverPlayers) {
    const seen = new Set();

    for (const p of serverPlayers) {
        seen.add(p.id);
        let player = players.get(p.id);
        if (!player) {
            player = new Player(p.id, p.id === myPlayerId, playerNames.get(p.id) || '');
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