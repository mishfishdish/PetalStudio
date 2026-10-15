# PetalStudio garage control

The `/garage` page sends an authenticated command to a Supabase Edge Function. The function broadcasts it through Supabase Realtime, and the ESP receives it immediately over a persistent secure WebSocket. There is no polling or stored command queue.

## Architecture

```text
Netlify /garage → Supabase Edge Function → Realtime Broadcast
                                                ↓ wss
                                        ESP32 controller
```

The Edge Function is deployed as `garage-command` in Supabase project `yjhctwilgmjsmbelmyrj`. Its source is committed at `supabase/functions/garage-command/index.ts`.

## ESP setup

Install in Arduino IDE:

- ESP32 board support
- **WebSockets by Markus Sattler** (`arduinoWebSockets`)

Copy `firmware/garage_controller/secrets.h.example` to `secrets.h`, then configure:

```cpp
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"
#define GARAGE_API_KEY "your-existing-garage-key"

#define SUPABASE_HOST "yjhctwilgmjsmbelmyrj.supabase.co"
#define SUPABASE_PUBLISHABLE_KEY "your-project-publishable-key"
#define SUPABASE_CHANNEL "your-private-garage-channel"
```

The real local `secrets.h` has already been populated and is excluded from Git. Upload `garage_controller.ino`, then open Serial Monitor at 115200 baud. A healthy connection prints:

```text
Connected. IP: 192.168.x.x
Supabase WebSocket connected — joining garage channel
Supabase Realtime channel ready
```

## Security design

- The browser authenticates to the Edge Function with `GARAGE_API_KEY`, kept only in `sessionStorage`.
- The function source stores only a SHA-256 digest of that high-entropy key, not the plaintext key.
- Supabase's service-role key remains inside the Edge Function runtime and is never sent to the browser or ESP.
- The ESP uses a publishable Supabase key, which is safe for public clients, plus a random 192-bit channel capability stored only in its ignored `secrets.h` and the Edge Function.
- The channel is receive-only from the ESP's perspective. Commands can only be published through the authenticated Edge Function.
- Realtime messages are not replayed or queued, so an old command cannot activate the door after the ESP reconnects.
- Command IDs prevent duplicate pulses during one ESP session.

The firmware uses `beginSSL` without pinning a CA certificate. Traffic is encrypted, but the ESP does not validate Supabase's identity. Before permanent use, switch to the Arduino WebSockets library's CA-certificate or certificate-bundle setup for your selected ESP core.

## Relay wiring and safety

The sketch uses GPIO 26 and produces a 500 ms active-low pulse. Use a dry-contact, opto-isolated relay across the opener's low-voltage wall-button terminals. Never connect the ESP to mains voltage or directly to the motor. Some encoded wall controls require a compatible interface or a spare remote whose button contacts can be bridged.

Only operate the door when it is visible and clear. Keep the opener's original obstruction sensors enabled. Add a reed switch if the UI needs reliable open/closed state.

## Deploying the frontend

The Supabase Edge Function URL is already configured in `src/Garage.jsx`. Pushes to `main` trigger the existing Netlify deployment. No extra Netlify environment variable is required for Supabase.
