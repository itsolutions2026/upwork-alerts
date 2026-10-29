// WebSocket server that receives new Upwork jobs from the Chrome extension
// and lists them in a popup window at the top-right of the screen (popup.ps1).
//
// Run:  set TOKEN=some-secret && node server.js
// Click a job in the popup to open it in your browser.

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
// 127.0.0.1 = only this PC (right for Cloudflare Tunnel). 0.0.0.0 = whole network (Tailscale/LAN).
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.TOKEN;
const MAX_LISTED = 50; // most jobs kept in the popup at once
const POPUP_SCRIPT = path.join(__dirname, 'popup.ps1');
const POPUP_DATA = path.join(os.tmpdir(), 'upwork-popup.json');

if (!TOKEN) {
  console.error('Set TOKEN first, for example:  set TOKEN=my-secret  (cmd)  or  $env:TOKEN="my-secret"  (PowerShell)');
  process.exit(1);
}

const log = (...args) => console.log(new Date().toLocaleTimeString(), ...args);

// Jobs shown in the popup that you haven't closed yet. A new batch closes the
// open popup and reopens it with new jobs on top, so you never lose any.
let unread = [];
let popup = null;

function showPopup() {
  fs.writeFileSync(POPUP_DATA, JSON.stringify(unread));
  const old = popup;
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', POPUP_SCRIPT, '-JsonFile', POPUP_DATA],
    { windowsHide: true },
  );
  proc.stderr.on('data', (d) => log('popup error:', d.toString().trim()));
  proc.on('exit', () => {
    // Closed by you (not replaced by a newer popup): those jobs are read.
    if (popup === proc) {
      popup = null;
      unread = [];
    }
  });
  popup = proc;
  if (old) old.kill();
}

function alertJobs(jobs) {
  jobs.forEach((j) =>
    log(`NEW: ${j.title} | ${j.type} ${j.budget} | proposals ${j.proposals} | ${j.location} | ${j.url}`),
  );
  unread = [...jobs, ...unread].slice(0, MAX_LISTED);
  showPopup();
}

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('connection', (ws, req) => {
  const who = req.socket.remoteAddress;
  let authed = false;
  log(`connection from ${who}`);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      if (msg.token !== TOKEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'wrong token' }));
        log(`wrong token from ${who}`);
        return ws.close();
      }
      authed = true;
      ws.send(JSON.stringify({ type: 'welcome' }));
      log(`extension connected from ${who}`);
      return;
    }
    if (!authed) return ws.close();

    if (msg.type === 'new_jobs' && Array.isArray(msg.jobs) && msg.jobs.length) alertJobs(msg.jobs);
  });

  ws.on('close', () => log(`disconnected ${who}`));
});

log(`listening on ws://${HOST}:${PORT}`);
