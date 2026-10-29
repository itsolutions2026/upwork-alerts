// Runs on the job search page. Reads every job tile and hands the list to
// background.js, which decides what is new and alerts the server.
(() => {
  const log = (...args) => console.log('[Upwork Watcher]', ...args);

  const text = (root, sel) => {
    const el = root.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  };

  function readTile(tile) {
    const link = tile.querySelector('[data-test~="job-tile-title-link"]');
    const href = link ? link.getAttribute('href') : '';
    return {
      id: tile.getAttribute('data-ev-job-uid'),
      title: link ? link.textContent.replace(/\s+/g, ' ').trim() : '',
      url: href ? new URL(href, location.origin).href.split('?')[0] : '',
      posted: text(tile, '[data-test~="job-pubilshed-date"] > span:first-child'),
      proposals: text(tile, '[data-test~="proposals-tier"]').replace(/^Proposals:\s*/, ''),
      type: text(tile, '[data-test~="job-type-label"]'),
      budget: text(tile, '[data-test~="is-fixed-price"]').replace(/^Est\. budget:\s*/, ''),
      level: text(tile, '[data-test~="experience-level"]'),
      spent: text(tile, '[data-test~="total-spent"] strong'),
      rating: text(tile, '[data-test~="total-feedback"] .air3-rating-value-text'),
      location: text(tile, '[data-test~="location"] .rr-mask').replace(/^Location\s*|\s*Location$/g, ''),
      paymentVerified: !!tile.querySelector('[data-test~="payment-verified"] .is-verified'),
      description: text(tile, '[data-test~="JobDescription"]').slice(0, 400),
      skills: [...tile.querySelectorAll('[data-test="token"]')].map((t) => t.textContent.trim()),
    };
  }

  // Tiles are rendered by Upwork's app after page load, so wait for them.
  let tries = 0;
  const timer = setInterval(() => {
    const tiles = document.querySelectorAll('article[data-test="JobTile"]');
    if (!tiles.length && ++tries < 60) return;
    clearInterval(timer);
    const jobs = [...tiles].map(readTile).filter((j) => j.id);
    log(`found ${jobs.length} jobs`);
    chrome.runtime.sendMessage({ type: 'jobs', jobs, pageUrl: location.href });
  }, 500);
})();
