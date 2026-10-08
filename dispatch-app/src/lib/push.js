import { api } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Notification permission is per browser, not per account, but the server ties
// each device's push subscription to one user. If someone signs in on a device
// that already granted permission (e.g. an admin on a phone previously used to
// test a flagger login), the "Enable Notifications" prompt never shows and the
// device would stay registered to the old user. Re-registering on every app
// open points the device at whoever is signed in now.
export async function syncPushSubscription() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }));
    await api.post("/api/push?action=subscribe", { subscription: subscription.toJSON() });
  } catch {
    // Best-effort; the explicit Enable Notifications flow still reports errors.
  }
}

export async function enablePushReminders() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("VITE_VAPID_PUBLIC_KEY is not configured.");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await api.post("/api/push?action=subscribe", { subscription: subscription.toJSON() });
  return subscription;
}
