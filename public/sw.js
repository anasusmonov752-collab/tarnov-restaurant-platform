// ── RestoPro Training Platform — Service Worker ──
const VERSION   = 'restopro-v5';
const STATIC    = 'restopro-static-v5';
const API_CACHE = 'restopro-api-v5';

// Static assets to precache
const PRECACHE = [
  '/',
  '/index.html',
  '/waiter.html',
  '/restaurant-admin.html',
  '/css/style.css?v=5.0',
  '/js/utils.js',
  '/images/logo.jpg',
  '/images/logo.svg',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// API routes to cache (network-first, fallback to cache)
const API_ROUTES = [
  '/api/waiter/menu',
  '/api/waiter/info',
  '/api/waiter/announcements',
  '/api/waiter/history'
];

// ── Install: precache static assets ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC)
      .then(cache => cache.addAll(PRECACHE.filter(url => !url.includes('icon'))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart caching strategy ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and chrome-extension
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // API routes: Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    if (API_ROUTES.some(r => url.pathname.startsWith(r))) {
      e.respondWith(networkFirstAPI(e.request));
    }
    return;
  }

  // HTML sahifalar: Network first (har doim yangi versiya)
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(networkFirstHTML(e.request));
    return;
  }

  // Static assets (css, js, images): Cache first, fallback to network
  e.respondWith(cacheFirst(e.request));
});

// HTML uchun: har doim serverdan oladi, xato bo'lsa keshdan
async function networkFirstHTML(req) {
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) {
      const cache = await caches.open(STATIC);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstAPI(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline rejimda ishlayapsiz', offline: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    // Return offline page for navigation
    if (req.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// ── Push notifications ──
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'Tarnov Training';
  const options = {
    body: data.body || 'Yangi xabar bor',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/waiter.html' },
    actions: [
      { action: 'open', title: '▶ Ochish' },
      { action: 'close', title: '✕ Yopish' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'open' || !e.action) {
    e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
  }
});
