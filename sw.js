// Safer Service Worker for Offline Fallback & caching
const CACHE_NAME = 'lightning-crm-cache-v5';
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
//
// Rueckrufe (api/rueckrufe.js) und die Sales Bell kommen hier an.
//
// Ist das CRM auf DIESEM Geraet gerade vorne und im Fokus, zeigt es die
// Meldung selbst (Karte oben rechts mit Ton) — eine zweite Systemmitteilung
// waere doppelt. Das gilt nur fuer Chrome/Edge: Safari (Mac und iPhone)
// verlangt zu jedem Push eine sichtbare Mitteilung und entzieht sonst die
// Erlaubnis. Dort erscheint sie immer; das `tag` sorgt dafuer, dass sich
// Meldungen zum selben Lead ersetzen statt stapeln.

const istChromium = /Chrome|Chromium|Edg\//.test(self.navigator.userAgent) &&
                    !/iPhone|iPad|iPod/.test(self.navigator.userAgent);

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch (e) { data = { title: 'Lightning CRM', body: event.data.text() }; }
  }

  event.waitUntil((async () => {
    const fenster = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    fenster.forEach(c => c.postMessage({ typ: data.typ || 'push', leadId: data.leadId }));

    const vorne = fenster.some(c => c.focused && c.visibilityState === 'visible');
    if (vorne && istChromium && (data.typ === 'rueckruf' || data.typ === 'rueckrufe')) return;

    await self.registration.showNotification(data.title || 'Lightning CRM', {
      body: data.body || '',
      icon: '/icon-192.png?v=4',
      badge: '/icon-192.png?v=4',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      requireInteraction: data.typ === 'rueckruf' || data.typ === 'rueckrufe',
      vibrate: [120, 60, 120, 60, 240],
      data: { url: data.url || '/', leadId: data.leadId || null, typ: data.typ || null }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.url || '/';

  event.waitUntil((async () => {
    const fenster = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Ein offenes CRM-Fenster nach vorne holen und dort den Lead oeffnen —
    // statt ein zweites Fenster aufzumachen.
    const crm = fenster.find(c => new URL(c.url).origin === self.location.origin);
    if (crm) {
      await crm.focus();
      if (d.leadId) crm.postMessage({ typ: 'oeffne', leadId: d.leadId });
      else if (d.typ === 'rueckrufe') crm.postMessage({ typ: 'oeffne-stapel' });
      return;
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
