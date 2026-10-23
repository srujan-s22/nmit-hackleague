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
  let payload = {
    title: 'NMIT HackLeague Announcement',
    body: 'You have a new update regarding your hackathon.',
    url: '/student/hackathons',
    tag: 'hackleague-notification-' + Date.now(),
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = {
        title: json.title || payload.title,
        body: json.body || payload.body,
        url: json.url || payload.url,
        tag: json.tag || payload.tag,
      };
    } catch {
      try {
        const text = event.data.text();
        if (text) payload.body = text;
      } catch {
        // preserve fallback
      }
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/nmit.jpeg',
    badge: '/nmit.jpeg',
    tag: payload.tag,
    data: {
      url: payload.url,
      timestamp: Date.now(),
    },
    requireInteraction: false,
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If an existing tab is open on this origin, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url === targetUrl) {
            return client.focus();
          }
          if (new URL(client.url).origin === self.location.origin) {
            if ('navigate' in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
      }
      // 2. Otherwise open a new window
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
