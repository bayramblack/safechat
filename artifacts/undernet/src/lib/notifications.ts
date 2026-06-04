export type NotificationPermissionState = "default" | "granted" | "denied";

export function getNotificationPermission(): NotificationPermissionState {
  if (!("Notification" in window)) return "denied";
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!("Notification" in window)) return "denied";
  const result = await Notification.requestPermission();
  return result as NotificationPermissionState;
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (getNotificationPermission() !== "granted") return;
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          ...options,
        });
      });
    } else {
      new Notification(title, {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        ...options,
      });
    }
  } catch {
  }
}

export function supportsNotifications(): boolean {
  return "Notification" in window;
}

export function supportsPush(): boolean {
  return "PushManager" in window && "serviceWorker" in navigator;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;

  try {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;

    const statusRes = await fetch("/api/notifications/status", { credentials: "include" });
    if (!statusRes.ok) return null;
    const { vapidPublicKey, hasActiveSubscription } = await statusRes.json();
    if (!vapidPublicKey) return null;

    let subscription = await registration.pushManager.getSubscription();

    if (subscription && hasActiveSubscription) {
      return subscription;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
    }

    await fetch("/api/notifications/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return subscription;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
