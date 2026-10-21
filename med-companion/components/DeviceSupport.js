import { useEffect, useState } from "react";
import {
  OFFLINE_KEY,
  setOfflineAccess,
  getOfflineAccess,
} from "../lib/offline";

export function OfflineSettings() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      getOfflineAccess()
        .then((value) => {
          if (active) {
            setEnabled(value);
            localStorage.setItem(OFFLINE_KEY, String(value));
          }
        })
        .catch(() => {});
    refresh();
    navigator.serviceWorker?.addEventListener("controllerchange", refresh);
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", refresh);
    };
  }, []);
  async function update(value) {
    setBusy(true);
    try {
      await setOfflineAccess(value);
      setEnabled(value);
      setMessage(
        value
          ? "Offline access enabled. Open Today and your week while connected to refresh saved information."
          : "Saved schedules and medication photos removed from this device.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>📱 Offline access on this device</h2>
      <p>
        Save your schedule, medicine list and instructions on a personal,
        screen-locked device. Other people using this browser may be able to
        read saved health information. Caregiver settings and PIN sessions are
        never cached.
      </p>
      <button
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => update(!enabled)}
      >
        {busy
          ? "Updating…"
          : enabled
            ? "Remove offline health data"
            : "Enable offline access"}
      </button>
      <p role="status">{message}</p>
      <p className="dose-sub">
        Offline information is read-only and expires after 24 hours. Confirm
        doses when connected so the safety lock and supply stay accurate.
      </p>
    </section>
  );
}

export default function DeviceSupport() {
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    const prompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const installed = () => setInstallEvent(null);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    let running = false;
    let disposed = false;
    async function check() {
      if (
        disposed ||
        running ||
        !navigator.onLine ||
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        localStorage.getItem("companion-local-reminders") !== "true"
      )
        return;
      running = true;
      try {
        const response = await fetch("/api/schedule");
        if (
          !response.ok ||
          response.headers.get("X-Companion-Offline") === "true"
        )
          return;
        const doses = await response.json();
        const now = Date.now();
        const sent = JSON.parse(
          localStorage.getItem("companion-local-sent") || "{}",
        );
        for (const id of Object.keys(sent))
          if (now - sent[id] > 86400000) delete sent[id];
        for (const dose of Array.isArray(doses) ? doses : []) {
          const age = now - new Date(dose.scheduledTime).getTime();
          if (
            disposed ||
            dose.status !== "pending" ||
            age < 0 ||
            age > 3600000 ||
            sent[dose.id]
          )
            continue;
          const options = {
            body: "Open Companion to check this dose before taking any medicine.",
            tag: dose.id,
            icon: "/icon.svg",
          };
          const registration =
            "serviceWorker" in navigator
              ? await navigator.serviceWorker.getRegistration()
              : null;
          if (registration) {
            const existing = await registration.getNotifications({
              tag: dose.id,
            });
            if (!existing.length)
              await registration.showNotification(
                "Medication reminder",
                options,
              );
          } else new Notification("Medication reminder", options);
          sent[dose.id] = now;
        }
        if (!disposed)
          localStorage.setItem("companion-local-sent", JSON.stringify(sent));
      } catch {
      } finally {
        running = false;
      }
    }
    check();
    const timer = setInterval(check, 30000);
    window.addEventListener("companion-reminders-change", check);
    window.addEventListener("online", check);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("companion-reminders-change", check);
      window.removeEventListener("online", check);
    };
  }, []);

  async function install() {
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
      setInstalling(false);
    }
  }
  return (
    <>
      {offline && (
        <aside className="connectivity-banner" role="status">
          📴 You are offline. Saved information is read-only; dose confirmations
          require a connection.
        </aside>
      )}
      {installEvent && (
        <aside className="install-banner">
          <div>
            <strong>📲 Keep Companion close</strong>
            <p>Add it to your home screen for easier access.</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={install}
            disabled={installing}
          >
            {installing ? "Installing…" : "Install Companion"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setInstallEvent(null)}
          >
            Not now
          </button>
        </aside>
      )}
    </>
  );
}
