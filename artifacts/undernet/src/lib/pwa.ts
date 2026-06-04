let deferredPrompt: BeforeInstallPromptEvent | null = null;
let promptHandlers: Set<(canInstall: boolean) => void> = new Set();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function initPWAInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    promptHandlers.forEach((h) => h(true));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptHandlers.forEach((h) => h(false));
  });
}

export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}

export async function installPWA(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  promptHandlers.forEach((h) => h(false));
  return result.outcome === "accepted";
}

export function onInstallAvailable(handler: (canInstall: boolean) => void): () => void {
  promptHandlers.add(handler);
  return () => promptHandlers.delete(handler);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const basePath = import.meta.env.BASE_URL || "/";
    const isDev = import.meta.env.DEV;
    const swUrl = isDev ? `${basePath}dev-sw.js?dev-sw` : `${basePath}sw.js`;
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: basePath,
      type: isDev ? "module" : "classic",
    });
    return registration;
  } catch {
    return null;
  }
}
