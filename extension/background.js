// Background worker:
//  1. Reloads open Upwork search tabs every 5-6 minutes (random, so it looks less robotic).
//  2. Receives job lists from list.js and finds jobs it has not seen before.
//  3. Sends new jobs to your server over a WebSocket (one long-lived connection).
//     Jobs are queued in storage while the server is offline and sent on reconnect.

const SEARCH_URL = 'https://www.upwork.com/nx/search/jobs*';
const MAX_SEEN = 2000;
const log = (...args) => console.log('[Upwork Watcher]', ...args);

// ---------- page refresh ----------

function scheduleRefresh() {
  const minutes = 5 + Math.random(); // 5.0 - 6.0 min
  chrome.alarms.create('refresh', { delayInMinutes: minutes });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refresh') {
    // Only the result list itself. A job opened from the list has a URL like
    // /nx/search/jobs/details/~..., and reloading it would close the job you're reading.
    const tabs = (await chrome.tabs.query({ url: SEARCH_URL })).filter((t) =>
      /^\/nx\/search\/jobs\/?$/.test(new URL(t.url).pathname),
    );
    tabs.forEach((tab) => chrome.tabs.reload(tab.id));
    log(`reloaded ${tabs.length} search tab(s)`);
    scheduleRefresh();
  }
  connect(); // alarms also wake the worker, so make sure the socket is up
});

chrome.runtime.onInstalled.addListener(scheduleRefresh);
chrome.runtime.onStartup.addListener(scheduleRefresh);
chrome.alarms.create('keepalive', { periodInMinutes: 1 });

// ---------- new job detection ----------

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'jobs') handleJobs(msg.jobs);
});

async function handleJobs(jobs) {
  // First run has an empty seen list, so every job on the page counts as new.
  const { seen = [], queue = [] } = await chrome.storage.local.get(['seen', 'queue']);
  const seenSet = new Set(seen);
  const fresh = jobs.filter((j) => !seenSet.has(j.id));
  if (!fresh.length) return;

  const newSeen = [...fresh.map((j) => j.id), ...seen].slice(0, MAX_SEEN);
  await chrome.storage.local.set({ seen: newSeen, queue: [...queue, ...fresh] });
  log(`${fresh.length} new job(s)`);
  flushQueue();
}

// ---------- WebSocket to the server ----------

let ws = null;
let pingTimer = null;

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const { serverUrl, token } = await chrome.storage.sync.get(['serverUrl', 'token']);
  if (!serverUrl) {
    setStatus('No server set. Open the extension options.');
    return;
  }

  try {
    ws = new WebSocket(serverUrl);
  } catch (e) {
    setStatus(`Bad server address: ${e.message}`);
    return;
  }

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', token }));
    // Chrome keeps the worker alive while the socket is active (Chrome 116+).
    pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 20000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'welcome') {
      setStatus('Connected');
      flushQueue();
    } else if (msg.type === 'error') {
      setStatus(`Server refused: ${msg.message}`);
    }
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    setStatus('Disconnected, retrying...');
    setTimeout(connect, 10000);
  };
  ws.onerror = () => {}; // onclose handles retry
}

async function flushQueue() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return connect();
  const { queue = [] } = await chrome.storage.local.get('queue');
  if (!queue.length) return;
  ws.send(JSON.stringify({ type: 'new_jobs', jobs: queue }));
  await chrome.storage.local.set({ queue: [] });
  log(`sent ${queue.length} job(s) to server`);
}

function setStatus(status) {
  chrome.storage.local.set({ status, statusAt: Date.now() });
}

// Options page saved new settings: reconnect with them.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.serverUrl || changes.token)) {
    if (ws) ws.close();
    else connect();
  }
});

connect();
