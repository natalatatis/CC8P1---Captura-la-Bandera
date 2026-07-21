import dgram from 'node:dgram';
import readline from 'node:readline';

const DISCOVERY_PORT = 8888;
const BROADCAST_ADRESS = '255.255.255.255';

// Interface to interact with the terminal (show list and manual option)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Llave: "IP:tcp_port", Valor: { name, ip, tcp_port, state, players }
const foundServers = new Map();

// Disvoery function
function startDiscovery(){
    
    // Create socket
    const client = dgram.createSocket('udp4');

    client.on('error', (err) => {
        console.error(`Error en el socket UDP:\n${err.stack}`);
        client.close();
    })

    // Listening to responses on the local network servers
    client.on('message', (msg, rinfo) => {
        try{
            const data = JSON.parse(msg.toString('utf-8'));

            if(data.type === 'server_info' && data.v === 1){
                const serverKey = `${rinfo.address}:${data.tcp_port}`;

                //Save or update the information of the found server
                foundServers.set(serverKey, {
                    name: data.name,
                    ip: rinfo.address,
                    tcp_port: data.tcp_port,
                    state: data.state,
                    players: data.players
                });

                console.clear();
                console.clear();
                console.log("=== SERVIDORES ENCONTRADOS EN LA RED ====");
                let index = 1;
                for (const [key, server] of foundServers.entries()) {
                    console.log(`[${index}] Nombre: ${server.name} | IP: ${server.ip} | TCP Port: ${server.tcp_port} | Estado: ${server.state} | Jugadores: ${server.players}`);
                    index++;
                }
                console.log("\n(Escribe el número del servidor para conectarte o 'm' para conexión manual)");
            }

        }catch(e){
            // Ignore malformed packets that do not follow the JSON protocol
        }
    });

    client.bind(() => {
        // Enable the capacity of sendind difusion packets (broadcast)
        client.setBroadcast(true);

        const discoveryMessage = Buffer.from(JSON.stringify({ type: "discover", v: 1 }));

        console.log("Buscando servidores de CTF en la red local (Broadcast)...");
        
        // Send initial disvoery message
        sendBroadcastPacket(client, discoveryMessage);

        // Retry broadcast every 3s if any server starts late
        const broadcastInterval = setInterval(() => {
            sendBroadcastPacket(client, discoveryMessage);
        }, 3000);

        // Show menu so that the user chooses server or uses a manual IP
        promptUserSelection(client, broadcastInterval);
    });
}

// Send boradcast packet
function sendBroadcastPacket(client, message) {
    client.send(message, 0, message.length, DISCOVERY_PORT, BROADCAST_ADDRESS, (err) => {
        if (err) {
            console.error("Error al enviar broadcast:", err);
        }
    });
}

// Give the user selection
function promptUserSelection(client, broadcastInterval) {
    rl.question("\nSelecciona una opción:\n[Número] Conectarse a servidor de la lista\n[m] Conexión manual por IP\n> ", (answer) => {
        clearInterval(broadcastInterval);

        if (answer.trim().toLowerCase() === 'm') {
            rl.question("Introduce la dirección IP del servidor: ", (manualIp) => {
                rl.question("Introduce el puerto TCP del servidor: ", (manualTcpPort) => {
                    client.close();
                    rl.close();
                    initTcpGameConnection(manualIp.trim(), parseInt(manualTcpPort.trim(), 10));
                });
            });
        } else {
            const selectedIndex = parseInt(answer.trim(), 10) - 1;
            const serverEntries = Array.from(foundServers.values());

            if (serverEntries[selectedIndex]) {
                const targetServer = serverEntries[selectedIndex];
                console.log(`Conectando a ${targetServer.name} en ${targetServer.ip}:${targetServer.tcp_port}...`);
                client.close();
                rl.close();
                initTcpGameConnection(targetServer.ip, targetServer.tcp_port);
            } else {
                console.log("Opción inválida. Reiniciando búsqueda...");
                startDiscovery();
            }
        }
    });
}

function initTcpGameConnection(ip, tcpPort) {
    console.log(`[Siguiente paso listo] Proceder a abrir socket TCP hacia ${ip}:${tcpPort}`);
    // Aquí implementaremos la conexión TCP y el envío del mensaje "join" en el siguiente bloque de código.
}

// Execute discovery
startDiscovery();