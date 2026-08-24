# VIDAA IPTV

A lightweight, self-hosted Xtream IPTV player for Hisense and Toshiba televisions running VIDAA OS. It provides Live TV with EPG, movies, series, favorites, playback history, and a simple 10-foot interface controlled entirely by a TV remote.

There are no application accounts, cloud services, transcoders, Redis, or external databases. The TV plays provider media directly; Docker handles credentials, Xtream metadata, XMLTV parsing, caching, and the static UI.

> This project does not include IPTV service or credentials. Use only sources you are authorized to access.


## Quick start with Docker

```bash
git clone <repository>
cd <repository>
cp .env.example .env
# Edit .env; DEMO_MODE=true works without IPTV credentials.
docker compose up -d
```

Open `http://SERVER-IP:8080`. Check the container with:

```bash
curl http://SERVER-IP:8080/health
# {"status":"ok"}
```

Configuration, EPG cache, favorites, and history persist in the `vidaa-iptv-data` Docker volume (mounted as `/data`). The fixed volume name keeps the data across Portainer Git-stack repulls and ordinary redeployments. One shared profile is intentional.

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `DEMO_MODE` | `false` | Built-in mock catalog and public sample media |
| `XTREAM_BASE_URL` | — | Provider origin, e.g. `http://provider.example:8080` |
| `XTREAM_USERNAME` | — | Xtream username |
| `XTREAM_PASSWORD` | — | Xtream password |
| `XMLTV_URL` | — | Optional arbitrary HTTP(S) XMLTV URL |
| `EPG_REFRESH_HOURS` | `6` | XMLTV refresh interval |
| `PREFERRED_LIVE_FORMAT` | `auto` | `auto`, `hls`, or `ts` |
| `AUTOPLAY_LIVE` | `true` | Start selected live channels immediately |
| `REMEMBER_LAST_CHANNEL` | `true` | Retain the recently selected live channel |
| `PORT` | `8080` | Host port used by Compose |

Environment variables override Settings. The Settings password is returned blank by the API; leaving it blank preserves an existing saved password.

For a Portainer Git stack, define any desired variables in Portainer's stack environment. Compose passes them into the container directly; an `env_file` is not required. If credentials are entered through the app instead, they are stored in the `vidaa-iptv-data` volume and survive repository repulls.

### Xtream setup

Set the provider origin only—do not include `player_api.php` or credentials in `XTREAM_BASE_URL`. The server uses fixed, non-open-proxy calls for live, VOD, series, details, episodes, and short EPG. Use **Settings → Test Connection** before saving.

Providers vary, so normalization accepts common ID, image, episode, and metadata variations. Category-filtered requests, server pagination, and bounded UI pages prevent large catalogs from producing thousands of TV DOM nodes.

### XMLTV setup

Set `XMLTV_URL` to the normal Xtream endpoint:

```text
http://provider.example:8080/xmltv.php?username=USER&password=PASSWORD
```

or another XMLTV URL. The backend downloads, parses, trims to the useful time window, and saves EPG under `/data`. Matching order is:

1. Xtream `epg_channel_id` to XMLTV channel ID;
2. exact normalized channel/display name;
3. Xtream short EPG if no safe XMLTV match exists.

HD/FHD/4K suffixes are ignored for exact-name fallback, but ambiguous/fuzzy matches are rejected. XMLTV input is limited to 100 MB and is never parsed by the TV.

## Remote controls

| Remote | Desktop | Action |
|---|---|---|
| Up / Down / Left / Right | Arrow keys | Navigate; Left/Right seeks −10/+30 seconds during VOD playback |
| OK | Enter | Select, play, or toggle player information |
| Back / Return | Escape or Backspace | Close overlay, player, detail, section, then app |
| Play / Pause / Stop | Media keys | Playback control |
| Channel + / − | — | Previous/next live channel |
| Left (live playback) | Arrow Left | Open the channel browse bar: Up/Down previews now/next without leaving the current channel, OK tunes |
| Fast-forward / Rewind | Media keys | ±30/−10 seconds for VOD |

The central adapter uses documented VIDAA values: arrows `37–40`, Enter `13`, Backspace `8`, rewind `412`, stop `413`, play `415`, fast-forward `417`, and channel up/down `427/428`. It also accepts key-name fallbacks and known Back variants because firmware runtimes differ. Raw key codes never appear in screens or player code.

Focus is application-managed; browser spatial navigation is not used. Lists, grids, sidebars, cross-column neighbors, and the player browse bar are deterministic. Routes save the focused key, so Back restores the previous item. At Home, Back calls `window.close()`.

In development, append `?debug=1` to show route, focus key, and last remote action. It is not enabled in production.

## Architecture

```text
VIDAA TV / browser
  ├─ static Preact UI ────────┐
  ├─ metadata requests ───────┼─> Express ─> Xtream player_api.php
  └─ video / HLS fallback <───┘       ├─────> XMLTV source
         │                            └─────> /data JSON caches
         └── direct-play redirect ─────────> IPTV media origin
```

- `src/navigation` — explicit focus manager and stack helpers
- `src/platform` — browser/VIDAA key translation
- `src/player` — native video first, dynamically loaded HLS fallback
- `src/screens` — remote-first screens and complete async states
- `server/xtream` — fixed-endpoint client, TTL caching, normalization
- `server/epg` — XMLTV parser, conservative matcher, persistent cache
- `server/store.ts` — atomic JSON persistence for one shared profile
- `vidaa` — hosted-app deployment metadata and device instructions

The API proxy handles metadata only. `/api/play/:kind/:id` issues a redirect assembled from backend credentials; it never streams, buffers, transcodes, or restreams media.

## VIDAA installation

The recommended deployment is a hosted UI at `http://SERVER-IP:8080`. This matches VIDAA's web-app model and avoids separate frontend versions.

The [VIDAA Web App Development guide](https://www.vidaa.com/wp-content/uploads/2020/12/WebApp_Development_Guide_for_VIDAA.pdf) describes URL-based debug deployment through `hisense://debug`, 1080 resolution, `keydown` navigation, and `window.close()` on Home Back. That debug page depends on model/firmware. The current [VIDAA developer documentation portal](https://tvmodules-vidaa-dev.vidaahub.com/devvdocs/login.html) requires access; store distribution and current-device packaging must use the manifest/signing tools supplied there. Do not reuse a Tizen manifest or guess a VIDAA one.

Detailed steps and a URL metadata template are in [`vidaa/README.md`](vidaa/README.md). Use a fixed DHCP lease and confirm the TV can open `/health` before installation.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Vite runs at `http://localhost:5173` and proxies to Express on 8080. Demo Mode provides channels, EPG, movies, series, seasons, and episodes.

```bash
npm run typecheck
npm test
npm run build
npm start
```

Tests cover focus movement, Back-stack restoration, Xtream normalization, stream URL generation, XMLTV parsing/date offsets, and EPG matching.

## API overview

- `GET /health`, `/api/status`, `/api/config`
- `PUT /api/config`, `POST /api/config/test`, `POST /api/refresh`
- `GET /api/xtream/live-categories`, `/api/xtream/live-streams`
- `GET /api/xtream/vod/categories`, `/api/xtream/vod`, `/api/xtream/vod/:id`
- `GET /api/xtream/series/categories`, `/api/xtream/series`, `/api/xtream/series/:id`
- `GET /api/epg/:channelId`, `/api/play/:kind/:id`
- `GET/PUT/DELETE /api/favorites`, `GET/POST /api/history`

Request bodies are limited, upstream calls time out, URL schemes are validated, provider actions are allow-listed, and passwords are omitted from logs/API responses. Because there is intentionally no authentication, expose this only to a trusted LAN/VPN—not the public internet.

## Playback and codec limitations

Playback first uses the TV's native `<video>` and hardware decoder. HLS uses native support when available; otherwise the fallback is loaded only when needed. MPEG-TS, HLS, and MP4 success still depends on the VIDAA model, firmware, container, codecs, audio, and provider headers. There is no FFmpeg fallback by design.

If one channel fails while others work, try **Settings → Live format → HLS** or **TS**. A codec/container mismatch must be corrected at the provider/source.

## CORS and HTTP/HTTPS

Metadata uses the same-origin backend because Xtream servers often omit CORS headers. Media stays direct after a controlled redirect, so the provider must still permit playback from the TV.

Many IPTV origins are HTTP-only. An HTTPS UI playing HTTP media can trigger mixed-content blocking. On a trusted LAN, use HTTP for both, or valid HTTPS for both. A reverse proxy cannot solve an HTTP media origin without becoming a restreaming proxy, which this project avoids.

## Troubleshooting

**Blank/unreachable app** — Open `/health` from another LAN device, check port 8080/firewall, avoid client-isolated Wi-Fi, and use the server LAN IP rather than `localhost` on the TV.

**Provider test fails** — Include a custom port if needed but omit `player_api.php`; check credentials/account expiry; inspect `docker compose logs iptv` (passwords are not logged).

**Channels load but video fails** — Try HLS/TS, another channel, provider TV access, and mixed-content settings. Codec errors cannot be repaired without transcoding.

**EPG is empty** — Refresh IPTV data, verify XMLTV from the Docker host, and compare Xtream `epg_channel_id` with XMLTV IDs. Name fallback is intentionally conservative.

**Remote Back exits too early** — Firmware may emit a different value. Use `?debug=1` during development and update only `src/platform/remote.ts` after device confirmation.

**UI looks soft or incorrectly scaled** — Install the debug app at 1080 resolution; a 720 app surface will be enlarged by the TV even on a 4K panel. Append `?debug=1` to the app URL to see the viewport size and device-pixel ratio reported by the TV. The UI includes fixed fallbacks for older VIDAA browsers that do not support CSS `clamp()`.

**VIDAA install option is missing** — `hisense://debug` is firmware-dependent. Use the TV browser while testing or obtain current tooling through VIDAA rather than using an unofficial manifest.
