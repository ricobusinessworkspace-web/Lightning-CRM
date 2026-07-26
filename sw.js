// Safer Service Worker for Offline Fallback & caching
const CACHE_NAME = 'lightning-crm-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/theme.css',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => console.log('SW Cache error', err))
  );
});

self.addEventListener('fetch', (event) => {
  // Bypass cache for APIs, Supabase, and non-GET requests
  if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
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
