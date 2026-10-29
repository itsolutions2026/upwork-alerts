# Upwork Alerts

Watches your Upwork job search for new posts and pops them up on your PC the moment they appear.

Two parts:

- **`extension/`** — a Chrome extension ("Upwork Activity On Top") that runs in your browser, periodically reloads your Upwork search tab, finds jobs it hasn't seen before, and sends them to the server.
- **`server/`** — a Node.js WebSocket server that receives those jobs and shows them in a popup window (via `popup.ps1`). A Cloudflare Tunnel gives the extension a stable address to reach the server from anywhere.

The browser doing the watching and the PC showing the popups can be the same machine or two different machines.

## Server setup

Needs [Node.js](https://nodejs.org/) and (for remote access) [cloudflared](https://developers.cloudflare.com/cloudflare-tunnel/). `cloudflared.exe` is already in the folder.

```
cd server
npm install
```

Start it by double-clicking `server/start.bat`. On first run it:

- Generates a token and saves it to `token.txt` (keep this secret).
- Starts the Cloudflare tunnel `upwork-alerts` over HTTP/2.
- Starts `node server.js` on `localhost:8787`.

The console prints the **server address** (`wss://...`) and the **token**. You need both once, in the extension options.

The address never changes, so this is also wired to run at login via a shortcut in the Windows Startup folder. If you move this folder, update that shortcut's target to the new `server\start.bat`.

### Server environment

- `PORT` — default `8787`.
- `HOST` — `127.0.0.1` (this PC only, correct for Cloudflare Tunnel) or `0.0.0.0` (whole network, for Tailscale/LAN).
- `TOKEN` — shared secret; must match the extension. Read from the env var, else `token.txt`.

## Extension setup

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension/` folder.
2. Open the extension's options and set:
   - **Server address** — the `wss://...` address the server printed (or `ws://100.x.x.x:8787` for Tailscale/LAN).
   - **Token** — must match the server's token.
3. Open your Upwork job search (`https://www.upwork.com/nx/search/jobs`) and leave the tab open.

The extension reloads only the search list tab every 5–6 minutes (randomized), so opening a job to read it won't get interrupted. New jobs are queued in storage while the server is offline and sent on reconnect. Use **Forget seen jobs** in options to reset what it considers "already seen".

## How it fits together

```
Chrome (extension/)  ──WebSocket──▶  Cloudflare Tunnel  ──▶  server.js  ──▶  popup.ps1
  watches search                     wss://<your-domain>      localhost:8787    popup on screen
```

## Files

**extension/**: `manifest.json`, `background.js` (refresh + WebSocket), `content.js` / `content.css` (on-page widgets), `list.js` (reads the search results), `options.html` / `options.js` (settings). The `.md` / `.txt` files are captured Upwork page HTML kept for reference.

**server/**: `server.js`, `popup.ps1` (the popup UI), `start.bat`, `package.json`, `cloudflared.exe`, `token.txt`.
