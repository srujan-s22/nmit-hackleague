/**
 * NMIT HackLeague Web Push Service Worker
 * Handles incoming push notifications, background sync, and notification interactions.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload = {
    title: 'NMIT HackLeague Announcement',
    body: 'You have a new update regarding your hackathon.',
    url: '/',
    tag: 'hackleague-notification',
  };

  try {
    const json = event.data.json();
    payload = {
      title: json.title || payload.title,
      body: json.body || payload.body,
      url: json.url || payload.url,
      tag: json.tag || payload.tag,
    };
  } catch (e) {
    payload.body = event.data.text() || payload.body;
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/nmit-logo.svg',
    badge: '/nmit-logo.svg',
    tag: payload.tag,
    data: {
      url: payload.url,
    },
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.getSubscription().then((subscription) => {
      if (subscription) {
        return fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh') || new ArrayBuffer(0))))),
              auth: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth') || new ArrayBuffer(0))))),
            },
            deviceFingerprint: 'sw-refreshed-' + Date.now(),
          }),
        });
      }
    })
  );
});
