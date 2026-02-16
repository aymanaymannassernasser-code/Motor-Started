const CACHE_NAME = 'motorstart-v3.1.1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            
            return fetch(e.request).then(response => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                
                if (e.request.url.startsWith(self.location.origin) || 
                    e.request.url.includes('cdn.jsdelivr.net') ||
                    e.request.url.includes('fonts.googleapis.com')) {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(e.request, response.clone());
                        return response;
                    });
                }
                
                return response;
            }).catch(err => {
                console.error('Fetch failed for:', e.request.url, err);
                return new Response('Offline - resource not cached', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});