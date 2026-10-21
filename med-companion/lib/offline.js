export const OFFLINE_KEY = "companion-offline-enabled";
export async function setOfflineAccess(enabled) {
  if (!("serviceWorker" in navigator))
    throw new Error("Offline access is unavailable in this browser.");
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error("Please reload once and try again.");
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(
      () => reject(new Error("Offline storage did not respond.")),
      10000,
    );
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      event.data?.ok
        ? resolve()
        : reject(new Error("Could not update offline storage."));
    };
    worker.postMessage({ type: enabled ? "ENABLE_OFFLINE" : "CLEAR_OFFLINE" }, [
      channel.port2,
    ]);
  });
  localStorage.setItem(OFFLINE_KEY, String(enabled));
  window.dispatchEvent(new Event("companion-offline-change"));
  if (enabled) {
    const pages = await Promise.all(
      ["/", "/week", "/pillbox"].map((url) => fetch(url)),
    );
    const resources = new Set(
      performance
        .getEntriesByType("resource")
        .map((item) => item.name)
        .filter(
          (url) =>
            new URL(url).origin === location.origin &&
            new URL(url).pathname.startsWith("/_next/static/"),
        ),
    );
    for (const response of pages) {
      const document = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      document
        .querySelectorAll('script[src],link[rel="stylesheet"][href]')
        .forEach((node) => {
          const url = new URL(
            node.getAttribute("src") || node.getAttribute("href"),
            location.origin,
          );
          if (
            url.origin === location.origin &&
            url.pathname.startsWith("/_next/static/")
          )
            resources.add(url.href);
        });
    }
    await Promise.all(
      [
        ...resources,
        "/api/schedule",
        "/api/schedule?range=week",
        "/api/medications",
        "/api/medications?active=true",
      ].map((url) => fetch(url)),
    );
  }
}

export async function getOfflineAccess() {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(false), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data?.enabled === true);
    };
    registration.active.postMessage({ type: "OFFLINE_STATUS" }, [
      channel.port2,
    ]);
  });
}
