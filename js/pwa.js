// ===== PWA: service worker registration + iOS install hint =====
(function () {
  // Works from both the site root and /pages/ (and under subpath hosting)
  const base = location.pathname.includes('/pages/') ? '../' : './';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(base + 'sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }

  // --- iOS "Add to Home Screen" hint ---
  // Safari on iOS never prompts to install; show a one-time dismissible hint.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const dismissed = localStorage.getItem('amicabull_install_hint') === 'dismissed';

  if (!isIOS || isStandalone || dismissed) return;

  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.setAttribute('role', 'dialog');
    banner.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:9999',
      'background:#0f1029', 'color:#e8e8f0', 'border-radius:16px',
      'padding:14px 16px', 'display:flex', 'align-items:center', 'gap:12px',
      'font:14px/1.45 Inter,system-ui,sans-serif',
      'box-shadow:0 8px 30px rgba(15,16,41,.35)'
    ].join(';');
    banner.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 40 40" fill="none" style="flex-shrink:0">' +
      '<circle cx="14" cy="20" r="10" stroke="#818cf8" stroke-width="2.5"/>' +
      '<circle cx="26" cy="20" r="10" stroke="#6366f1" stroke-width="2.5"/></svg>' +
      '<div>Install AmicaBull: tap <strong>Share</strong> ' +
      '<span aria-hidden="true" style="font-size:16px">&#x2191;&#xFE0E;</span> ' +
      'then <strong>Add to Home Screen</strong></div>' +
      '<button aria-label="Dismiss" style="margin-left:auto;background:none;border:none;' +
      'color:#a5a5c0;font-size:22px;padding:4px 8px;cursor:pointer">&times;</button>';
    banner.querySelector('button').addEventListener('click', () => {
      localStorage.setItem('amicabull_install_hint', 'dismissed');
      banner.remove();
    });
    document.body.appendChild(banner);
  });
})();
