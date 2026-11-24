// Replaces the service worker the app had when it lived at /app/: clears that copy's cache, removes
// itself and reloads its pages, which then redirect to the same place at the root.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith('smoothstep ' + self.registration.scope)) await caches.delete(name);
  }
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({type: 'window'})) client.navigate(client.url);
})()));
