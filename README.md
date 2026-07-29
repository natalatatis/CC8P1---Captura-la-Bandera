# 🏴 Capture The Flag - CC8

Implementación de un juego **Capture The Flag** en 3D desarrollado con **Node.js**, **Three.js** y **Vite**, siguiendo el protocolo estándar definido para el laboratorio de Ciencias de la Computación VIII.

El proyecto implementa una arquitectura **cliente-servidor** utilizando **TCP** para la comunicación del juego y **UDP** para el descubrimiento automático de servidores. Debido a las restricciones de los navegadores web, se utiliza un **Bridge** que traduce la comunicación entre WebSocket y TCP/UDP.

---

# Tecnologías utilizadas

- Node.js
- JavaScript (ES Modules)
- Three.js
- Vite
- TCP Sockets
- UDP Sockets
- WebSockets

---

# Arquitectura

```
                ┌──────────────────────┐
                │    Cliente (Web)     │
                │ Three.js + Vite       │
                └──────────┬───────────┘
                           │
                      WebSocket
                           │
                ┌──────────▼───────────┐
                │        Bridge         │
                │  TCP / UDP Translator │
                └──────────┬───────────┘
                           │
                     TCP / UDP
                           │
                ┌──────────▼───────────┐
                │   Servidor Node.js    │
                │ GameState + Protocol  │
                └──────────────────────┘
```

---

# Características

- Descubrimiento automático de servidores mediante UDP Broadcast.
- Conexión manual mediante dirección IP y puerto.
- Comunicación TCP utilizando mensajes JSON.
- Juego multijugador en tiempo real.
- Servidor autoritativo.
- Sincronización continua del estado del juego.
- Modo espectador para el anfitrión.
- Reinicio automático de la partida.

---

# Estructura del proyecto

```
client/
│
├── src/
    ├── Flag.js
│   ├── main.js
│   ├── Network.js
│   ├── SceneManager.js
    ├── Renderer.js
│   ├── Player.js
│   └── InputHandler.js
├── style/
    ├── main.css
├── protocol/
    ├──parser.js
server/
├── game/
    ├── state.js
    ├── validator.js
├── network/
    ├── bridge.js
    ├── gameSocket.js
    ├── GameState.js
├── index.js
```

---

# Instalación

Clonar el repositorio:

```bash
git clone <https://github.com/natalatatis/CC8P1---Captura-la-Bandera>
```

Entrar al proyecto:

```bash
cd <ctf-game>
```

Instalar dependencias:

```bash
npm install
```

---

# Ejecutar el proyecto

El proyecto requiere **tres procesos ejecutándose simultáneamente**.

## 1. Iniciar el servidor

```bash
npm run server
```

Este proceso inicia:

- Servidor TCP
- Descubrimiento UDP
- GameState
- Lógica del juego

---

## 2. Iniciar el Bridge

En otra terminal:

```bash
npm run bridge
```

El Bridge:

- Escucha conexiones WebSocket del navegador.
- Realiza el descubrimiento UDP.
- Mantiene la conexión TCP con el servidor.
- Traduce mensajes entre ambos.

---

## 3. Iniciar el cliente

En una tercera terminal:

```bash
npm run dev
```

Vite iniciará el servidor de desarrollo.

Generalmente estará disponible en:

```
http://localhost:5173
```

---

# Flujo de conexión

1. El navegador abre una conexión WebSocket con el Bridge.
2. El Bridge descubre servidores mediante UDP.
3. El servidor responde con `server_info`.
4. El cliente muestra la lista de servidores.
5. El usuario selecciona uno.
6. El Bridge abre una conexión TCP.
7. El cliente envía `join`.
8. El servidor responde con `welcome`.
9. El servidor envía `lobby`.
10. Cuando existen al menos dos jugadores comienza `countdown`.
11. El servidor envía `start`.
12. Durante la partida los clientes envían `input` e `interact`.
13. El servidor envía continuamente `state`.
14. Al finalizar la partida se envía `game_over`.
15. El servidor reinicia automáticamente el lobby.

---

# Mensajes principales

| Mensaje | Descripción |
|----------|-------------|
| discover | Descubre servidores disponibles mediante UDP. |
| server_info | Información del servidor encontrada durante el descubrimiento. |
| join | Solicita unirse a la partida. |
| welcome | Confirma la conexión y asigna un identificador único. |
| lobby | Lista de jugadores conectados. |
| countdown | Cuenta regresiva antes del inicio. |
| start | Indica el comienzo de la partida. |
| input | Dirección de movimiento enviada por el cliente. |
| interact | Solicitud para capturar o robar la bandera. |
| state | Estado completo de la partida enviado por el servidor. |
| game_over | Anuncia al ganador. |
| error | Notifica errores del protocolo. |

---

# Controles

| Tecla | Acción |
|-------|--------|
| W A S D | Movimiento |
| Flechas | Movimiento |
| Espacio | Robar bandera |
| E | Robar bandera |

---

# Modo espectador

El anfitrión puede conectarse como espectador.

En este modo:

- Puede observar toda la partida.
- Recibe todos los mensajes del servidor.
- No puede mover al jugador.
- No puede capturar la bandera.
- No cuenta para el mínimo de jugadores.

---

# Autores

Proyecto desarrollado para el curso **Ciencias de la Computación VIII**.

