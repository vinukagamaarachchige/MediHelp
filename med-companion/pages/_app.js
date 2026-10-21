import Toast from "../components/Toast";
import DeviceSupport from "../components/DeviceSupport";
import Dialog from "../components/Dialog";
import ScrollEmphasis from "../components/ScrollEmphasis";
import Icon from "../components/Icon";
import Head from "next/head";
import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getTranslation } from "../lib/translations";
import "../styles/globals.css";
import "../styles/refinement.css";

// App context for language, theme, and toast notifications
export const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [lang, setLang] = useState("en");
  const [theme, setTheme] = useState("light");
  const [fontScale, setFontScale] = useState(100);
  const [prefsReady, setPrefsReady] = useState(false);
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [canSetupLocal, setCanSetupLocal] = useState(false);
  const protectedRoute = ["/caregiver", "/settings", "/medications", "/prescription", "/activity"].some(path => router.pathname.startsWith(path));
  function requestUnlock(href = router.asPath) {
    setPendingRoute(href); setPinModalOpen(true); setPinValue(""); setPinError("");
  }
  async function lockCaregiver() {
    await fetch("/api/settings", { method: "DELETE" }).catch(() => {});
    setIsUnlocked(false);
  }
  const [toasts, setToasts] = useState([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [pendingRoute, setPendingRoute] = useState(null);

  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(console.error); }, []);

  // Load saved preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.person?.theme) setTheme(data.person.theme);
          if (data.person?.language) setLang(data.person.language);
          setIsUnlocked(data.authenticated === true);
          setDeviceAuthorized(data.deviceAuthorized === true);
          setNeedsSetup(data.needsSetup === true);
          setCanSetupLocal(data.canSetupLocally === true);
          if (data.deviceAuthorized) localStorage.setItem("companion-device-authorized", "true");
          else localStorage.removeItem("companion-device-authorized");
          try {
            const saved = JSON.parse(localStorage.getItem("companion-appearance") || "null");
            if (saved?.theme) setTheme(saved.theme);
            if (saved?.language) setLang(saved.language);
            setFontScale(Math.max(100, Math.min(225, Number(saved?.fontScale || data.person?.fontScale) || 100)));
          } catch { setFontScale(data.person?.fontScale || 100); }
        }
      } catch (err) {
        if (localStorage.getItem("companion-device-authorized") === "true" && localStorage.getItem("companion-offline-enabled") === "true") setDeviceAuthorized(true);
        try { const saved = JSON.parse(localStorage.getItem("companion-appearance") || "{}"); setFontScale(saved.fontScale || 100); if (saved.theme) setTheme(saved.theme); if (saved.language) setLang(saved.language); } catch {}
      } finally { setPrefsReady(true); }
    }
    loadPrefs();
  }, []);

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String(fontScale / 100));
    document.documentElement.dataset.largeText = String(fontScale >= 150);
    document.documentElement.lang = lang === "si" ? "si-LK" : "en";
    if (!prefsReady) return;
    const preferences = { theme, language: lang, fontScale };
    try { localStorage.setItem("companion-appearance", JSON.stringify(preferences)); } catch {}
    if (!deviceAuthorized) return;
    const timer = setTimeout(() => fetch("/api/settings", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ preferences }) }).catch(() => {}), 400);
    return () => clearTimeout(timer);
  }, [fontScale, theme, lang, prefsReady, deviceAuthorized]);

  useEffect(() => {
    if (prefsReady && (!deviceAuthorized || protectedRoute && !isUnlocked)) requestUnlock();
  }, [prefsReady, protectedRoute, router.asPath, isUnlocked, deviceAuthorized]);

  useEffect(() => {
    if (!deviceAuthorized) return;
    const timer = setInterval(async () => {
      try { const response = await fetch("/api/settings"); if (response.ok) { const data = await response.json(); if (!data.authenticated) setIsUnlocked(false); if (!data.deviceAuthorized) { setDeviceAuthorized(false); localStorage.removeItem("companion-device-authorized"); } } } catch {}
    }, 60000);
    return () => clearInterval(timer);
  }, [deviceAuthorized]);

  // Toast dispatcher
  function showToast(message, type = "success") {
    const id = Date.now() + Math.random();
    setToasts([{ id, message, type }]);
  }

  // Toggle theme
  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  }

  // Toggle language
  function toggleLang() {
    setLang((prev) => (prev === "en" ? "si" : "en"));
  }

  // Intercept caregiver and settings routes if PIN required and not unlocked
  function navigateProtected(e, href) {
    if (!isUnlocked && ["/caregiver", "/settings", "/medications", "/prescription", "/activity"].some(path => href.startsWith(path))) {
      e.preventDefault();
      setPendingRoute(href);
      setPinModalOpen(true);
      setPinValue("");
      setPinError("");
    }
  }

  async function handlePinSubmit(e) {
    if (e) e.preventDefault();
    const pin = pinValue;
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsSetup ? { setupPin: pin } : { verifyPin: pin }),
      });
      const data = await res.json();
      if (res.status === 429) { setPinError(data.error); return; }
      if (data.valid) {
        setIsUnlocked(true);
        setDeviceAuthorized(true);
        setNeedsSetup(false);
        localStorage.setItem("companion-device-authorized", "true");
        setPinModalOpen(false);
        setPinError("");
        showToast("Authenticated successfully", "success");
        if (pendingRoute) {
          router.push(pendingRoute);
          setPendingRoute(null);
        }
      } else {
        setPinError(data.error || getTranslation("incorrectPin", lang));
      }
    } catch (err) {
      setPinError("Verification error");
    }
  }

  const t = (key) => getTranslation(key, lang);
  const secondaryNavigation = [{href:"/medications",label:t("medications"),emoji:"💊"},{href:"/prescription/new",label:t("addPrescription"),emoji:"📝"},{href:"/caregiver",label:t("caregiver"),emoji:"🤝"},{href:"/activity",label:t("activity"),emoji:"📋"},{href:"/settings",label:t("settings"),emoji:"⚙️"}];

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        theme,
        setTheme,
        fontScale, setFontScale, requestUnlock,
        showToast,
        t,
        isUnlocked,
        deviceAuthorized,
        setIsUnlocked,
      }}
    >
      <Head><link rel="manifest" href="/manifest.json" /><meta name="theme-color" content="#205c49" /><link rel="apple-touch-icon" href="/icon-192.png" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <Link href="/" className="brand"><span className="brand-symbol"><Icon name="pill" size={25} /></span><span>Companion<small>Everyday care, made simpler</small></span></Link>
        <div className="nav-controls">
          <button className="nav-btn" onClick={toggleLang} title="Toggle English / Sinhala">{lang === "en" ? "සිංහල" : "English"}</button>
          <button className="nav-btn theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? "Use dark theme" : "Use light theme"}><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        </div>
      </header>
      <nav className="nav" aria-label="Main navigation">
        <div className="nav-links">
          {[{ href: "/", label: t("today"), icon: "today" }, { href: "/week", label: t("week"), icon: "week" }, { href: "/pillbox", label: lang === "si" ? "පෙති පෙට්ටිය" : "Pill box", icon: "box" }].map(item => <Link key={item.href} href={item.href} aria-current={router.pathname === item.href ? "page" : undefined} className={`nav-link ${router.pathname === item.href ? "active" : ""}`}><Icon name={item.icon} />{item.label}</Link>)}
          {secondaryNavigation.map(item => <Link key={item.href} href={item.href} onClick={e => navigateProtected(e, item.href)} aria-current={router.pathname.startsWith(item.href) ? "page" : undefined} className={`nav-link desktop-nav-link ${router.pathname.startsWith(item.href) ? "active" : ""}`}><span className="recognition-emoji" aria-hidden="true">{item.emoji}</span>{item.label}{!isUnlocked && <Icon name="lock" size={14}/>}</Link>)}
          {isUnlocked && <button className="nav-btn desktop-nav-link" onClick={() => { lockCaregiver(); if (router.pathname.startsWith("/caregiver") || router.pathname.startsWith("/settings")) router.push("/"); }}><Icon name="lock" size={16}/>Lock</button>}
          <details className="more-menu" key={router.asPath}>
            <summary className="nav-link"><Icon name="more" />{lang === "si" ? "තවත්" : "More"}</summary>
            <div className="more-panel">
              {secondaryNavigation.map(item => <Link key={item.href} href={item.href} onClick={e => navigateProtected(e, item.href)}><span className="menu-label"><span className="recognition-emoji" aria-hidden="true">{item.emoji}</span>{item.label}</span>{!isUnlocked && <Icon name="lock" size={16}/>}</Link>)}
              {isUnlocked && <button onClick={() => { lockCaregiver(); if (router.pathname.startsWith("/caregiver") || router.pathname.startsWith("/settings")) router.push("/"); }}>Lock caregiver views</button>}
            </div>
          </details>
        </div>
        <span className="nav-caption">{lang === "si" ? "එක් දවසක් බැගින්." : "A little support. Every day."}</span>
      </nav>

      <main className="container" id="main-content">
        {!deviceAuthorized ? <section className="card locked-area"><h1>🔒 Authorize this device</h1><p>{needsSetup ? "First set a caregiver PIN on the computer running Companion. Medication data stays private until this device is authorized." : "Enter the caregiver PIN once to allow this device to view medication schedules. Caregiver changes remain separately locked."}</p><button className="btn btn-primary" onClick={() => requestUnlock()}>{needsSetup ? "Set up caregiver PIN" : "Authorize device"}</button></section> : protectedRoute && !isUnlocked ? <section className="card locked-area"><h1>🔒 Caregiver access</h1><p>Unlock to view or change protected information.</p><button className="btn btn-primary" onClick={() => requestUnlock()}>Enter caregiver PIN</button><Link className="btn btn-secondary" href="/">Back to Today</Link></section> : <Component {...pageProps} />}
        {deviceAuthorized && <DeviceSupport />}
        <ScrollEmphasis route={router.asPath} />
      </main>

      {/* Floating Toast Notification Stack */}
      <div className="toast-container" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={id => setToasts(previous => previous.filter(item => item.id !== id))} />)}
      </div>

      {/* PIN Authentication Modal */}
      {pinModalOpen && (
        <Dialog title={needsSetup ? "Set up caregiver PIN" : `🔒 ${t("pinTitle")}`} onClose={() => setPinModalOpen(false)}>
          <div className="pin-dialog">
            <h2>🔒 {needsSetup ? "Set up caregiver PIN" : t("pinTitle")}</h2>
            <p style={{ color: "var(--muted)", fontSize: "calc(14px * var(--font-scale, 1))" }}>
              {needsSetup ? "Choose a non-repeating 6–12 digit PIN. Default PINs are no longer accepted." : "Enter your caregiver PIN. Existing custom 4-digit PINs still work; new PINs use 6–12 digits."}
            </p>
            <form onSubmit={handlePinSubmit}>
              {needsSetup && !canSetupLocal ? <p role="alert">Open Companion at localhost on the computer running the server to complete first-time setup.</p> : <label htmlFor="caregiver-pin">{needsSetup ? "New caregiver PIN" : "Caregiver PIN"}<input id="caregiver-pin" type="password" inputMode="numeric" autoComplete="off" minLength={needsSetup ? 6 : 4} maxLength={12} required pattern="[0-9]{4,12}" value={pinValue} onChange={e => setPinValue(e.target.value.replace(/[^0-9]/g, ""))} autoFocus /></label>}

              {pinError && <p style={{ color: "var(--danger)", fontSize: "calc(14px * var(--font-scale, 1))" }}>{pinError}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setPinModalOpen(false);
                    setPendingRoute(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={needsSetup && !canSetupLocal}>
                  {t("unlock")}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </AppContext.Provider>
  );
}
