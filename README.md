# PetalStudio garage control

PetalStudio includes a private `/garage` page that sends a short-lived command to a Netlify Function. An ESP32 or ESP8266 polls the function and briefly closes a dry-contact relay wired in parallel with the garage wall button.

## 1. Configure Netlify

Deploy this repository normally, then create a Netlify environment variable named `GARAGE_API_KEY` (scope: Functions). Use a long random value, for example:

```sh
openssl rand -hex 32
```

Trigger a new deploy after adding the variable. Do not put the key in `netlify.toml`, source code, or a Vite environment variable.

## 2. Configure the ESP

1. Install ESP32 or ESP8266 board support in Arduino IDE.
2. Copy `firmware/garage_controller/secrets.h.example` to `secrets.h`.
3. Add your Wi-Fi, Netlify hostname, and the same `GARAGE_API_KEY`.
4. Confirm `RELAY_PIN`, `RELAY_ACTIVE`, and `RELAY_IDLE` match your relay board.
5. Upload `garage_controller.ino` and check the serial monitor at 115200 baud.

Use a dry-contact, opto-isolated relay. Connect its normally-open contacts across the opener's low-voltage wall-button terminals—not to mains voltage or the garage motor. Some modern openers use encoded wall controls and require a compatible interface or a spare remote whose button contacts can be bridged.

## 3. Use it

Open `https://your-site.netlify.app/garage`, enter the shared access key, and press **Open / close**. The key is kept only in `sessionStorage`, so closing the browser tab forgets it.

## Security and safety

- Commands expire after 30 seconds and the API enforces an 8-second cooldown.
- The relay always returns to its idle state after 500 ms and is set idle before Wi-Fi connects.
- The ESP makes outbound requests only; do not port-forward it or expose it as a public server.
- The starter sketch calls `setInsecure()`: traffic is encrypted, but the ESP does not verify Netlify's identity. Before permanent use, install the correct CA certificate with `setCACert(...)` for your board/core and remove `setInsecure()`. Certificate handling differs between ESP32 and ESP8266 Arduino cores.
- This control reports command delivery, not the physical position of the door. Add a reed switch before presenting “open/closed” state in the UI.
- Only operate the door when it is visible and clear. Keep the opener's original obstruction sensors enabled.

## Local development

Use the Netlify CLI so the function and Blobs context are available:

```sh
npm install
npx netlify dev
```

Set `GARAGE_API_KEY` in a local `.env` file (which should remain uncommitted), then visit the printed local `/garage` URL.
