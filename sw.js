const CACHE_NAME = 'daily-planner-v1';
const urlsToCache = [
    '/',
    '/index.html',
    'https://i.postimg.cc/x87RR692/favicon-32x32.png',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});