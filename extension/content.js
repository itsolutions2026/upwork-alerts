// Reads the "Activity on this job" numbers from the Upwork job page and shows
// them in our own floating widget. The widget is only ADDED to <body>: Upwork's
// own page is never changed, moved or hidden (inserting into it made Upwork's
// app drop the job card). Drag the widget by its title; the spot is remembered.
(() => {
  const PANEL_ID = 'uat-panel';
  const HEADING = 'activity on this job';
  const log = (...args) => console.log('[Upwork Activity On Top]', ...args);

  // Upwork markup: <section><h5>Activity on this job</h5>
  // <ul class="client-activity-items"><li class="ca-item"><span class="title">..</span>
  // <span class="value">..</span></li></ul></section>
  function findActivitySection() {
    const lists = document.querySelectorAll('ul.client-activity-items');
    if (lists.length) {
      const list = lists[lists.length - 1]; // last one = job opened in a side panel
      return list.closest('section') || list.parentElement;
    }
    // Fallback: find the heading by its text.
    const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (const h of headings) {
      if (h.textContent.trim().toLowerCase() === HEADING) {
        return h.closest('section') || h.parentElement;
      }
    }
    return null;
  }

  function readRows(section) {
    const rows = [];
    section.querySelectorAll('li').forEach((li) => {
      const titleEl = li.querySelector('.title');
      const valueEl = li.querySelector('.value');
      if (titleEl && valueEl) {
        rows.push([titleEl.textContent.trim(), valueEl.textContent.trim()]);
        return;
      }
      // Unknown markup: use the visible text, skipping hidden tooltips.
      const text = li.innerText.trim();
      const i = text.indexOf(':');
      if (i > 0) rows.push([text.slice(0, i + 1).trim(), text.slice(i + 1).trim()]);
    });
    return rows;
  }

  let savedPos = null; // {left, top} in px, set by dragging
  chrome.storage.local.get('widgetPos').then(({ widgetPos }) => {
    savedPos = widgetPos || null;
    const panel = document.getElementById(PANEL_ID);
    if (panel) placePanel(panel);
  });

  function placePanel(panel) {
    if (!savedPos) return; // default spot comes from content.css
    const left = Math.min(Math.max(0, savedPos.left), window.innerWidth - 80);
    const top = Math.min(Math.max(0, savedPos.top), window.innerHeight - 40);
    Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, transform: 'none' });
  }

  function makeDraggable(panel) {
    panel.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.uat-title')) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const move = (ev) => {
        savedPos = { left: ev.clientX - dx, top: ev.clientY - dy };
        placePanel(panel);
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        chrome.storage.local.set({ widgetPos: savedPos });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function render(rows) {
    let panel = document.getElementById(PANEL_ID);
    if (!rows) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      makeDraggable(panel);
      document.body.appendChild(panel);
      placePanel(panel);
    }
    const html =
      '<div class="uat-title" title="Drag to move">Activity on this job</div>' +
      rows
        .map(([t, v]) => `<div class="uat-row"><span>${esc(t)}</span><b>${esc(v)}</b></div>`)
        .join('');
    if (panel.innerHTML !== html) panel.innerHTML = html;
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  let lastState = '';
  function sync() {
    const section = findActivitySection();
    const rows = section ? readRows(section) : null;
    const state = JSON.stringify(rows);
    if (state !== lastState) {
      log(section ? 'activity found' : 'no activity section on this page', rows);
      lastState = state;
    }
    render(rows && rows.length ? rows : null);
  }

  // Throttle, not debounce: Upwork's page changes constantly, so a debounce
  // could wait forever.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      sync();
    }, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

  log('loaded on', location.href);
  sync();
})();
