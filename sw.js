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
