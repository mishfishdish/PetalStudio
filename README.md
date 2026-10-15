# PetalStudio garage control

The `/garage` page and ESP controller communicate through an authenticated, persistent WebSocket. Commands are pushed immediately; there is no HTTP polling or command queue.

## Architecture

```text
Netlify /garage ──wss──┐
                       ├── WebSocket relay ── command/ack
ESP32 controller ─wss──┘
```

Netlify hosts the frontend only. A long-running WebSocket relay must be deployed to a WebSocket-capable service. `relay/server.mjs` and `render.yaml` are provided for Render.

## 1. Deploy the WebSocket relay

1. In Render, create a Blueprint from this GitHub repository using `render.yaml`.
2. When prompted for `GARAGE_API_KEY`, paste the existing generated garage key.
3. Deploy the service and copy its hostname, for example `petalstudio-garage-relay.onrender.com`.
4. Its health URL should return JSON: `https://YOUR-RELAY.onrender.com/`.
5. Its WebSocket URL is `wss://YOUR-RELAY.onrender.com/garage`.

Keep the relay at one instance. It stores only live connections in memory and does not store commands. If the ESP is offline, the button reports that the controller is offline and nothing is queued.

## 2. Configure Netlify

Add this build environment variable and redeploy:

```text
VITE_GARAGE_WEBSOCKET_URL=wss://YOUR-RELAY.onrender.com/garage
```

The frontend asks for the garage access key at runtime and keeps it only in `sessionStorage`. Do not put `GARAGE_API_KEY` in a `VITE_` variable, because Vite variables are public browser code.

## 3. Configure the ESP

Install these in Arduino IDE:

- ESP32 or ESP8266 board support
- **WebSockets by Markus Sattler** (`arduinoWebSockets`)

Copy `firmware/garage_controller/secrets.h.example` to `secrets.h`, then configure:

```cpp
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"
#define GARAGE_API_KEY "same-key-used-on-render"
#define WEBSOCKET_HOST "YOUR-RELAY.onrender.com"
#define WEBSOCKET_PORT 443
#define WEBSOCKET_PATH "/garage"
```

Upload `garage_controller.ino` and open Serial Monitor at 115200 baud. A healthy connection prints:

```text
Connected. IP: 192.168.x.x
WebSocket connected — authenticating
WebSocket authenticated and ready
```

## Relay wiring and safety

The sketch uses GPIO 26 and produces a 500 ms active-low pulse. Use a dry-contact, opto-isolated relay wired across the opener's low-voltage wall-button terminals. Never connect the ESP to mains voltage or directly to the motor. Some encoded wall controls require a compatible interface or a spare remote whose button contacts can be bridged.

The relay returns to idle after every pulse and starts idle before networking. Commands contain unique IDs so duplicate WebSocket delivery cannot pulse twice during one ESP session. The relay does not store commands, which prevents an old command from operating the door after the controller reconnects.

The starter firmware calls `beginSSL` without a CA certificate: traffic is encrypted, but the ESP does not validate the relay certificate. Before permanent use, switch to the library's CA-certificate or certificate-bundle setup for your selected ESP Arduino core.

Only operate the door when it is visible and clear. Keep the opener's original obstruction sensors enabled. Add a reed switch if the UI needs reliable open/closed state.

## Local development

Run the relay and frontend in separate terminals:

```sh
GARAGE_API_KEY=your-key npm run relay
VITE_GARAGE_WEBSOCKET_URL=ws://localhost:8080/garage npm run dev
```
