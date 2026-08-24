# VIDAA deployment

This project uses VIDAA's hosted HTML5 web-app model. The Docker URL is the app URL; there is no second frontend build to keep synchronized.

1. Start the container and verify `http://SERVER-IP:8080/health` from another LAN device.
2. Replace the address in `app-url.example.json` with the server's fixed LAN IP.
3. On developer-enabled/older firmware, open `hisense://debug`, enter the app name and HTTP(S) app URL, select 1080 resolution, and install. This debug page is firmware-dependent and is absent on many recent retail TVs.
4. For current production devices or store distribution, request VIDAA developer/partner access and register the same hosted URL using the tooling and signing/submission process supplied by VIDAA. VIDAA does not publish a universal manifest that can safely be invented here.

Pressing Back on the app home calls `window.close()` as required by the VIDAA web-app guide. All other Back presses are consumed by the internal route/player stack.

For a bundled/offline package, run `npm run build`, provide `dist/` to the VIDAA packaging tools supplied with your developer access, and configure the frontend API origin for your LAN server. The hosted model is recommended because it avoids mixed frontend versions and still keeps media playback direct from the TV.

See the root README for key codes, network constraints, and troubleshooting.
