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

// ── PWA: Device detection ──
const _isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
const _isSafari  = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches
                   || window.navigator.standalone === true;

// ── Android/Desktop: native install prompt ──
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(() => showInstallBanner('android'), 3000);
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwaInstalled', '1');
  deferredInstallPrompt = null;
  document.getElementById('pwa-banner')?.remove();
});

// ── iOS Safari: manual "Add to Home Screen" guide ──
window.addEventListener('load', () => {
  if (_isIOS && _isSafari && !_isStandalone) {
    if (!localStorage.getItem('pwaInstalled') && !localStorage.getItem('pwaDismissed')) {
      setTimeout(() => showInstallBanner('ios'), 3500);
    }
  }
});

// ── Banner renderer ──
function showInstallBanner(type) {
  if (document.getElementById('pwa-banner')) return;
  if (localStorage.getItem('pwaInstalled') || localStorage.getItem('pwaDismissed')) return;

  const STYLE = `
    position:fixed; bottom:88px; left:12px; right:12px; z-index:9000;
    background:rgba(10,8,3,0.96); backdrop-filter:blur(28px) saturate(180%);
    -webkit-backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(200,146,42,0.35); border-radius:20px;
    box-shadow:0 -8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
    animation:pwaSlideUp 0.45s cubic-bezier(0.34,1.2,0.64,1);
    overflow:hidden;
  `;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';

  if (type === 'ios') {
    // iOS — step-by-step instruction
    banner.innerHTML = `
      <style>
        @keyframes pwaSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        .pwa-arrow { position:absolute; bottom:-10px; left:50%; transform:translateX(-50%);
          width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent;
          border-top:10px solid rgba(200,146,42,0.35); }
      </style>
      <div style="${STYLE}">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px 10px">
          <img src="/images/icon.svg" style="width:44px;height:44px;border-radius:11px;border:1px solid rgba(200,146,42,0.3);flex-shrink:0">
          <div style="flex:1">
            <div style="font-weight:700;font-size:0.92rem;color:#fff">Ilovani o'rnating!</div>
            <div style="font-size:0.76rem;color:#AAA;margin-top:1px">Bosh ekranga qo'shing — tezroq kirish</div>
          </div>
          <button onclick="dismissInstall()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:50%;width:28px;height:28px;color:#888;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
        </div>

        <!-- Divider -->
        <div style="height:1px;background:rgba(200,146,42,0.15);margin:0 16px"></div>

        <!-- Steps -->
        <div style="padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px">
          <!-- Step 1 -->
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:9px;background:rgba(200,146,42,0.12);border:1px solid rgba(200,146,42,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8922A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style="font-size:0.85rem;font-weight:600;color:#fff">Pastdagi <span style="color:#C8922A">Share</span> tugmasini bosing</div>
              <div style="font-size:0.73rem;color:#888;margin-top:1px">Safari quyi qismidagi yuklash belgisi</div>
            </div>
          </div>

          <!-- Step 2 -->
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:9px;background:rgba(200,146,42,0.12);border:1px solid rgba(200,146,42,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8922A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <div>
              <div style="font-size:0.85rem;font-weight:600;color:#fff"><span style="color:#C8922A">"Add to Home Screen"</span> tanlang</div>
              <div style="font-size:0.73rem;color:#888;margin-top:1px">Pastga scroll qilib toping</div>
            </div>
          </div>

          <!-- Step 3 -->
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:9px;background:rgba(46,204,113,0.12);border:1px solid rgba(46,204,113,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div style="font-size:0.85rem;font-weight:600;color:#fff"><span style="color:#2ECC71">"Add"</span> tugmasini bosing</div>
              <div style="font-size:0.73rem;color:#888;margin-top:1px">Ilova bosh ekranda paydo bo'ladi!</div>
            </div>
          </div>
        </div>

        <!-- Bottom arrow indicator -->
        <div class="pwa-arrow"></div>
      </div>`;

  } else {
    // Android / Desktop — native prompt
    banner.innerHTML = `
      <style>@keyframes pwaSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }</style>
      <div style="${STYLE}">
        <div style="padding:16px 18px;display:flex;align-items:center;gap:14px">
          <img src="/images/icon.svg" style="width:48px;height:48px;border-radius:12px;border:1px solid rgba(200,146,42,0.3);flex-shrink:0">
          <div style="flex:1">
            <div style="font-weight:700;font-size:0.92rem;color:#fff;margin-bottom:2px">Ilovani o'rnating!</div>
            <div style="font-size:0.78rem;color:#AAA">Tarnov Training — telefonga qo'shing</div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="installPWA()" style="background:linear-gradient(135deg,#E5A93A,#C8922A);color:#000;border:none;border-radius:10px;padding:8px 14px;font-size:0.82rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(200,146,42,0.4);white-space:nowrap">O'rnatish</button>
            <button onclick="dismissInstall()" style="background:rgba(255,255,255,0.07);color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 10px;font-size:0.82rem;cursor:pointer">✕</button>
          </div>
        </div>
      </div>`;
  }

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
