// Safer Service Worker for Offline Fallback & caching
const CACHE_NAME = 'lightning-crm-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/theme.css',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // Neue Version sofort uebernehmen, statt auf das Schliessen aller Tabs zu warten.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => console.log('SW Cache error', err))
  );
});

self.addEventListener('activate', (event) => {
  // Alte Caches aufraeumen — sonst bleiben Nutzer auf einer alten Version haengen.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Bypass cache for APIs, Supabase, and non-GET requests
  if (req.method !== 'GET' || req.url.includes('supabase.co') || req.url.includes('/api/')) {
    return;
  }

  const isDocument = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isDocument) {
    // Network-first fuer HTML: ein Deployment muss die Nutzer sofort erreichen.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first fuer statische Assets
  event.respondWith(
    caches.match(req).then((response) => response || fetch(req))
  );
});

// --- Web Push Handling ---

self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data = { title: 'CRM Benachrichtigung', body: event.data.text() };
    }
  }

  const title = data.title || 'Lightning CRM';
  const options = {
    body: data.body || 'Neue Benachrichtigung',
    icon: '/favicon.ico', // You should add a proper 192x192 icon here later
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // This looks to see if the current is already open and focuses if it is
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      const targetUrl = event.notification.data.url;
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
