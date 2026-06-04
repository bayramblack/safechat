/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; data?: Record<string, unknown> };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "UnderNet", body: event.data.text() };
  }

  const title = payload.title || "UnderNet";
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
    vibrate: [200, 100, 200],
    tag: payload.data?.conversationId ? `conv-${payload.data.conversationId}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  if (data.type === "call" && data.conversationId) {
    targetUrl = `/?call=${data.conversationId}${data.callSessionId ? `&callSession=${data.callSessionId}` : ""}`;
  } else if (data.conversationId) {
    targetUrl = `/?chat=${data.conversationId}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: "notification_click", data });
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
