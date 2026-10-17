self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {}; try { data = event.data.json(); } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Medication reminder', {
    body: data.body || 'Open Medication Companion to check your schedule.', icon: '/icon.svg', tag: data.tag || 'med-reminder', data: { url: '/' }
  }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type: 'window'}).then(clients => clients.length ? clients[0].focus() : self.clients.openWindow('/')));
});
