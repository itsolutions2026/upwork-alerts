const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(['serverUrl', 'token']).then(({ serverUrl = '', token = '' }) => {
  $('serverUrl').value = serverUrl;
  $('token').value = token;
});

$('save').onclick = async () => {
  await chrome.storage.sync.set({ serverUrl: $('serverUrl').value.trim(), token: $('token').value.trim() });
  $('status').textContent = 'Saved. Connecting...';
};

$('reset').onclick = async () => {
  await chrome.storage.local.set({ seen: [], queue: [] });
  $('status').textContent = 'Seen jobs cleared. The next page load sends all jobs on the page again.';
};

async function showStatus() {
  const { status = 'Unknown', statusAt } = await chrome.storage.local.get(['status', 'statusAt']);
  const when = statusAt ? ` (${new Date(statusAt).toLocaleTimeString()})` : '';
  $('status').textContent = `Status: ${status}${when}`;
}
showStatus();
setInterval(showStatus, 2000);
