// Shared utilities for all pages

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server xatosi');
  return data;
}

async function apiForm(url, formData, method = 'POST') {
  const res = await fetch(url, {
    method,
    body: formData,
    credentials: 'same-origin'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server xatosi');
  return data;
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconMap = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };
  el.innerHTML = `<span class="toast-icon">${iconMap[type] || iconMap.info}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(num) {
  return Number(num || 0).toLocaleString('uz-UZ') + ' so\'m';
}

function scoreColor(score) {
  if (score >= 90) return 'var(--success)';
  if (score >= 70) return 'var(--warning)';
  return 'var(--danger)';
}

function diffLabel(d) {
  return d === 'easy' ? 'Oson' : d === 'medium' ? 'O\'rta' : 'Qiyin';
}

function confirmDialog(msg) {
  return window.confirm(msg);
}

// Guard: redirect if not authenticated or wrong role
async function requireRole(role) {
  try {
    const user = await api('/api/auth/me');
    if (user.role !== role) window.location.href = '/';
    return user;
  } catch {
    window.location.href = '/';
  }
}

// Call after any dynamic HTML render that includes data-lucide icons
function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

// ── PWA: Service Worker Registration ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('✦ SW registered:', reg.scope);
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Yangi versiya mavjud — sahifani yangilang', 'info');
            }
          });
        });
      })
      .catch(err => console.log('SW error:', err));
  });
}

// ── PWA: Install prompt (A2HS) ──
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show custom install banner after 3s
  setTimeout(() => showInstallBanner(), 3000);
});

function showInstallBanner() {
  if (!deferredInstallPrompt) return;
  if (localStorage.getItem('pwaInstalled') || localStorage.getItem('pwaDismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <div style="
      position:fixed; bottom:80px; left:12px; right:12px; z-index:9000;
      background:rgba(12,9,4,0.95); backdrop-filter:blur(24px);
      border:1px solid rgba(200,146,42,0.35); border-radius:18px;
      padding:16px 18px; display:flex; align-items:center; gap:14px;
      box-shadow:0 -4px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
      animation: slideUp 0.4s cubic-bezier(0.34,1.2,0.64,1);
    ">
      <img src="/images/icon.svg" style="width:48px;height:48px;border-radius:12px;border:1px solid rgba(200,146,42,0.3)">
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.92rem;color:#fff;margin-bottom:2px">Ilovani o'rnating!</div>
        <div style="font-size:0.78rem;color:#AAA">Tarnov Training — telefonga qo'shing</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="installPWA()" style="
          background:linear-gradient(135deg,#E5A93A,#C8922A); color:#000;
          border:none; border-radius:10px; padding:8px 14px;
          font-size:0.82rem; font-weight:700; cursor:pointer;
          box-shadow:0 4px 12px rgba(200,146,42,0.4);
        ">O'rnatish</button>
        <button onclick="dismissInstall()" style="
          background:rgba(255,255,255,0.07); color:#888; border:1px solid rgba(255,255,255,0.1);
          border-radius:10px; padding:8px 10px; font-size:0.82rem; cursor:pointer;
        ">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
}

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('pwaInstalled', '1');
    toast('Tarnov Training o\'rnatildi! 🎉', 'success');
  }
  deferredInstallPrompt = null;
  document.getElementById('pwa-banner')?.remove();
}

function dismissInstall() {
  localStorage.setItem('pwaDismissed', '1');
  document.getElementById('pwa-banner')?.remove();
}

window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwaInstalled', '1');
  deferredInstallPrompt = null;
  document.getElementById('pwa-banner')?.remove();
});
