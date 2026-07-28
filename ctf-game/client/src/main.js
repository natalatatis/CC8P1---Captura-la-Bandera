import { SceneManager } from './SceneManager.js';
import { Player } from './Player.js';
import { InputHandler } from './inputHandler.js';
import { NetworkClient } from './Network.js';

// ============================================================
// DOM references
// ============================================================

const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');

const nameInput = document.getElementById('playerName');

const serverListEl = document.getElementById('serverList');
const serverListEmptyEl = document.getElementById('serverListEmpty');

const manualIpInput = document.getElementById('manualIp');
const manualPortInput = document.getElementById('manualPort');
const manualConnectBtn = document.getElementById('manualConnectBtn');

const menuStatusEl = document.getElementById('menuStatus');
const menuCountdownEl = document.getElementById('menuCountdown');

const countdownEl = document.getElementById('countdownOverlay');
const gameOverEl = document.getElementById('gameOverOverlay');
const grabPromptEl = document.getElementById('grabPrompt');
const carryingBannerEl = document.getElementById('carryingBanner');

const squadRosterEl = document.getElementById('squadRoster');
const squadCountEl = document.getElementById('squadCount');

const roleClientBtn = document.getElementById('roleClientBtn');
const roleHostBtn = document.getElementById('roleHostBtn');

const discoverySectionEl = document.getElementById('discoverySection');
const hostSectionEl = document.getElementById('hostSection');

const hostConnectBtn = document.getElementById('hostConnectBtn');
const hostStatusEl = document.getElementById('hostStatus');

// ============================================================
// Constants
// ============================================================

const BRIDGE_URL = 'ws://localhost:8890';
const DEFAULT_TCP_PORT = 8889;
const DISCOVERY_INTERVAL_MS = 2000;

// ============================================================
// Game state
// ============================================================

let sceneManager = null;
let inputHandler = null;

let myPlayerId = null;
let config = null;

let isSpectator = false;

const players = new Map();
const playerNames = new Map();

let lastSentDir = { x: 0, y: 0 };
let phase = 'lobby';
let hasEnteredGame = false;

let discoveryIntervalId = null;

// ============================================================
// Small helpers
// ============================================================

function setStatus(text) {
    menuStatusEl.textContent = text;
}

function setHostStatus(text) {
    hostStatusEl.textContent = text;
}

function normalizeId(value) {
    return value === null || value === undefined ? null : String(value);
}

function stopDiscoveryLoop() {
    if (discoveryIntervalId !== null) {
        clearInterval(discoveryIntervalId);
        discoveryIntervalId = null;
    }
}

function requestDiscovery() {
    if (phase !== 'lobby' || isSpectator) {
        return;
    }

    console.log('[UI] Requesting server discovery...');
    net.discover();
}

function startDiscoveryLoop() {
    stopDiscoveryLoop();

    requestDiscovery();

    discoveryIntervalId = setInterval(() => {
        requestDiscovery();
    }, DISCOVERY_INTERVAL_MS);
}

// ============================================================
// Role selection
// ============================================================

roleClientBtn.addEventListener('click', () => setRole('client'));
roleHostBtn.addEventListener('click', () => setRole('host'));

function setRole(newRole) {
    isSpectator = newRole === 'host';

    roleClientBtn.classList.toggle('is-active', newRole === 'client');
    roleHostBtn.classList.toggle('is-active', newRole === 'host');

    discoverySectionEl.classList.toggle('hidden', newRole === 'host');
    hostSectionEl.classList.toggle('hidden', newRole === 'client');

    if (isSpectator) {
        stopDiscoveryLoop();
    } else if (phase === 'lobby') {
        startDiscoveryLoop();
    }
}

// ============================================================
// Bridge connection
// ============================================================

const net = new NetworkClient(BRIDGE_URL);

net.on('open', () => {
    console.log('[UI] Bridge WebSocket opened.');

    setStatus('Conectado al bridge local. Buscando servidores...');

    if (!isSpectator) {
        startDiscoveryLoop();
    }
});

net.on('close', () => {
    console.warn('[UI] Bridge WebSocket closed.');

    stopDiscoveryLoop();

    const text =
        'Se perdió la conexión con el bridge local ' +
        '(¿está corriendo "npm run bridge"?)';

    setStatus(text);
    setHostStatus(text);
});

net.on('bridge_connected', () => {
    console.log('[UI] Bridge connected to the TCP game server.');

    stopDiscoveryLoop();

    const defaultName = isSpectator
        ? 'Anfitrión'
        : `Jugador_${Math.floor(Math.random() * 1000)}`;

    const name = nameInput.value.trim() || defaultName;

    const statusText = isSpectator
        ? 'Conectado. Entrando como espectador...'
        : 'Conectado. Uniéndose a la partida...';

    setStatus(statusText);
    setHostStatus(statusText);

    net.join(name, isSpectator);
});

net.on('bridge_disconnected', () => {
    console.warn('[UI] Disconnected from the TCP game server.');

    const text = 'El servidor cerró la conexión.';

    setStatus(text);
    setHostStatus(text);

    myPlayerId = null;
    config = null;
    phase = 'lobby';

    if (!isSpectator) {
        startDiscoveryLoop();
    }
});

net.on('error', (msg) => {
    console.error('[UI] Network error:', msg);

    const text = `Error: ${msg.reason || msg.detail || 'desconocido'}`;

    setStatus(text);
    setHostStatus(text);
});

// ============================================================
// Server discovery
// ============================================================

net.on('server_list', (msg) => {
    console.log('[UI] Server list received:', msg);

    serverListEl.innerHTML = '';

    const servers = Array.isArray(msg.servers) ? msg.servers : [];

    serverListEmptyEl.classList.toggle('hidden', servers.length > 0);

    for (const server of servers) {
        const ip = String(server.ip || '').trim();
        const tcpPort = Number(server.tcp_port);

        if (!ip || !Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
            console.warn('[UI] Ignoring invalid discovered server:', server);
            continue;
        }

        const li = document.createElement('li');

        const name = document.createElement('span');
        name.className = 'srv-name';
        name.textContent = server.name || 'Servidor sin nombre';

        const meta = document.createElement('span');
        meta.className = 'srv-meta';
        meta.textContent =
            `${ip}:${tcpPort} · ` +
            `${server.state || 'desconocido'} · ` +
            `${Number(server.players) || 0} jugadores`;

        li.appendChild(name);
        li.appendChild(meta);

        li.addEventListener('click', () => {
            attemptConnect(ip, tcpPort);
        });

        serverListEl.appendChild(li);
    }

    const visibleServers = serverListEl.children.length;
    serverListEmptyEl.classList.toggle('hidden', visibleServers > 0);
});

// ============================================================
// Manual connection
// ============================================================

manualConnectBtn.addEventListener('click', () => {
    const ip = manualIpInput.value.trim();
    const port = Number.parseInt(manualPortInput.value.trim(), 10);

    if (!ip || !Number.isInteger(port) || port < 1 || port > 65535) {
        setStatus('Ingresa una IP y un puerto TCP válidos.');
        return;
    }

    attemptConnect(ip, port);
});

function attemptConnect(ip, tcpPort) {
    stopDiscoveryLoop();

    setStatus(`Conectando a ${ip}:${tcpPort}...`);
    net.connectTo(ip, tcpPort);
}

// ============================================================
// Host / spectator connection
// ============================================================

hostConnectBtn.addEventListener('click', () => {
    stopDiscoveryLoop();

    setHostStatus('Conectando a tu servidor local...');
    net.connectTo('127.0.0.1', DEFAULT_TCP_PORT);
});

// ============================================================
// Protocol messages
// ============================================================

net.on('welcome', (msg) => {
    console.log('[UI] welcome received:', msg);

    myPlayerId = normalizeId(msg.player_id);
    config = msg.config || null;

    const text = isSpectator
        ? 'Conectado como espectador. Esperando a que empiece la partida...'
        : '¡Bienvenido! Esperando a que se complete el escuadrón...';

    setStatus(text);
    setHostStatus(text);
});

net.on('lobby', (msg) => {
    console.log('[UI] lobby received:', msg);

    if (!Array.isArray(msg.players)) {
        console.error('[UI] Invalid lobby message:', msg);
        return;
    }

    const normalizedRoster = msg.players.map((player) => ({
        ...player,
        id: normalizeId(player.id),
        name: String(player.name ?? '')
    }));

    playerNames.clear();

    for (const player of normalizedRoster) {
        if (player.id === null) {
            continue;
        }

        playerNames.set(player.id, player.name);
        players.get(player.id)?.setName(player.name);
    }

    renderSquadRoster(normalizedRoster);

    if (hasEnteredGame) {
        returnToLobbyScreen();
    } else {
        phase = 'lobby';
        menuCountdownEl.classList.add('hidden');
    }
});

net.on('countdown', (msg) => {
    console.log('[UI] countdown received:', msg);

    phase = 'countdown';
    stopDiscoveryLoop();

    menuCountdownEl.classList.remove('hidden');
    menuCountdownEl.textContent =
        `La partida comienza en ${Number(msg.seconds) || 0}...`;
});

net.on('start', () => {
    console.log('[UI] start received.');

    phase = 'playing';
    stopDiscoveryLoop();

    menuCountdownEl.classList.add('hidden');
    startScene();
});

net.on('state', (msg) => {
    if (!Array.isArray(msg.players) || !msg.flag) {
        console.error('[UI] Invalid state message:', msg);
        return;
    }

    const normalizedPlayers = msg.players.map((player) => ({
        ...player,
        id: normalizeId(player.id)
    }));

    const normalizedFlag = {
        ...msg.flag,
        owner: normalizeId(msg.flag.owner)
    };

    syncPlayers(normalizedPlayers);

    if (sceneManager) {
        sceneManager.updateFlag(
            Number(normalizedFlag.x),
            Number(normalizedFlag.y),
            normalizedFlag.owner,
            players
        );
    }

    updateGrabPrompt({
        ...msg,
        players: normalizedPlayers,
        flag: normalizedFlag
    });
});

net.on('game_over', (msg) => {
    console.log('[UI] game_over received:', msg);

    phase = 'finished';

    grabPromptEl.classList.add('hidden');
    carryingBannerEl.classList.add('hidden');

    const winnerId = normalizeId(msg.winner);

    const winnerText = winnerId === myPlayerId
        ? '¡Ganaste!'
        : `Ganó: ${playerNames.get(winnerId) || winnerId || 'desconocido'}`;

    gameOverEl.classList.remove('hidden');
    gameOverEl.textContent = winnerText;
});

// ============================================================
// Lobby roster
// ============================================================

function renderSquadRoster(rosterPlayers) {
    const validPlayers = rosterPlayers.filter((player) => player.id !== null);

    squadCountEl.textContent = String(validPlayers.length);
    squadRosterEl.innerHTML = '';

    for (const player of validPlayers) {
        const li = document.createElement('li');

        if (player.id === myPlayerId) {
            li.classList.add('is-me');
        }

        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent =
            (player.name || '?').slice(0, 2).toUpperCase();

        const label = document.createElement('span');
        label.textContent =
            player.id === myPlayerId
                ? `${player.name || 'Jugador'} (tú)`
                : player.name || 'Jugador';

        li.appendChild(avatar);
        li.appendChild(label);

        squadRosterEl.appendChild(li);
    }
}

function returnToLobbyScreen() {
    console.log('[UI] Returning to lobby screen.');

    hasEnteredGame = false;
    phase = 'lobby';

    gameOverEl.classList.add('hidden');
    countdownEl.classList.add('hidden');
    menuCountdownEl.classList.add('hidden');
    grabPromptEl.classList.add('hidden');
    carryingBannerEl.classList.add('hidden');

    hudEl.classList.add('hidden');
    menuEl.classList.remove('hidden');

    setStatus('De vuelta en la sala de espera.');

    for (const player of players.values()) {
        sceneManager?.removePlayer(player);
    }

    players.clear();
}

// ============================================================
// Scene and state synchronization
// ============================================================

function startScene() {
    hasEnteredGame = true;

    document.activeElement?.blur();

    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');

    if (!sceneManager) {
        sceneManager = new SceneManager();

        if (!isSpectator) {
            inputHandler = new InputHandler(() => net.interact());
            startInputLoop();
        }

        animate();
    }
}

function syncPlayers(serverPlayers) {
    if (!sceneManager) {
        console.warn('[UI] State received before the scene was ready.');
        return;
    }

    const seen = new Set();

    for (const serverPlayer of serverPlayers) {
        const id = normalizeId(serverPlayer.id);

        if (id === null) {
            continue;
        }

        seen.add(id);

        let player = players.get(id);

        if (!player) {
            player = new Player(
                id,
                id === myPlayerId,
                playerNames.get(id) || ''
            );

            players.set(id, player);
            sceneManager.addPlayer(player);
        }

        player.updatePosition(
            Number(serverPlayer.x),
            Number(serverPlayer.y),
            sceneManager
        );
    }

    for (const [id, player] of players.entries()) {
        if (!seen.has(id)) {
            sceneManager.removePlayer(player);
            players.delete(id);
        }
    }
}

function updateGrabPrompt(msg) {
    const ownerId = normalizeId(msg.flag.owner);
    const iHaveFlag = ownerId === myPlayerId;

    carryingBannerEl.classList.toggle('hidden', !iHaveFlag);

    const me = msg.players.find(
        (player) => normalizeId(player.id) === myPlayerId
    );

    if (!me || iHaveFlag) {
        grabPromptEl.classList.add('hidden');
        return;
    }

    const radius = Number(config?.interact_radius) || 40;

    const dx = Number(me.x) - Number(msg.flag.x);
    const dy = Number(me.y) - Number(msg.flag.y);
    const distance = Math.sqrt(dx * dx + dy * dy);

    grabPromptEl.classList.toggle('hidden', distance > radius);
}

// ============================================================
// Input and rendering loops
// ============================================================

function startInputLoop() {
    setInterval(() => {
        if (phase !== 'playing' || !inputHandler) {
            return;
        }

        const dir = inputHandler.getDirection();

        if (
            dir.x !== lastSentDir.x ||
            dir.y !== lastSentDir.y
        ) {
            lastSentDir = { x: dir.x, y: dir.y };
            net.input(dir.x, dir.y);
        }
    }, 50);
}

function animate() {
    requestAnimationFrame(animate);

    if (sceneManager) {
        sceneManager.render();
    }
}
