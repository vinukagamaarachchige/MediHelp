import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getTranslation } from "../lib/translations";
import "../styles/globals.css";

// App context for language, theme, and toast notifications
export const AppContext = createContext();

export function useApp() {
  return useContext(AppContext);
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [lang, setLang] = useState("en");
  const [theme, setTheme] = useState("light");
  const [toasts, setToasts] = useState([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pendingRoute, setPendingRoute] = useState(null);

  // Load saved preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.person?.theme) setTheme(data.person.theme);
          if (data.person?.language) setLang(data.person.language);
          if (data.person?.pinEnabled === false) setIsUnlocked(true);
        }
      } catch (err) {
        // Fallback to local default
      }
    }
    loadPrefs();
  }, []);

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Toast dispatcher
  function showToast(message, type = "success") {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
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
    if (!isUnlocked && (href.startsWith("/caregiver") || href.startsWith("/settings"))) {
      e.preventDefault();
      setPendingRoute(href);
      setPinModalOpen(true);
      setPinDigits(["", "", "", ""]);
      setPinError("");
    }
  }

  async function handlePinSubmit(e) {
    if (e) e.preventDefault();
    const pin = pinDigits.join("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifyPin: pin }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsUnlocked(true);
        setPinModalOpen(false);
        setPinError("");
        showToast("Authenticated successfully", "success");
        if (pendingRoute) {
          router.push(pendingRoute);
          setPendingRoute(null);
        }
      } else {
        setPinError(getTranslation("incorrectPin", lang));
      }
    } catch (err) {
      setPinError("Verification error");
    }
  }

  function handleDigitChange(idx, val) {
    if (!/^\d*$/.test(val)) return;
    const next = [...pinDigits];
    next[idx] = val.slice(-1);
    setPinDigits(next);
    if (val && idx < 3) {
      const nextInput = document.getElementById(`pin-${idx + 1}`);
      if (nextInput) nextInput.focus();
    }
  }

  const t = (key) => getTranslation(key, lang);

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        theme,
        setTheme,
        showToast,
        t,
        isUnlocked,
        setIsUnlocked,
      }}
    >
      <nav className="nav">
        <div className="nav-links">
          <Link href="/" className={`nav-link ${router.pathname === "/" ? "active" : ""}`}>
            {t("today")}
          </Link>
          <Link
            href="/week"
            className={`nav-link ${router.pathname === "/week" ? "active" : ""}`}
          >
            {t("week")}
          </Link>
          <Link
            href="/prescription/new"
            className={`nav-link ${router.pathname === "/prescription/new" ? "active" : ""}`}
          >
            {t("addPrescription")}
          </Link>
          <Link
            href="/medications"
            className={`nav-link ${router.pathname === "/medications" ? "active" : ""}`}
          >
            {t("medications")}
          </Link>
          <Link
            href="/caregiver"
            onClick={(e) => navigateProtected(e, "/caregiver")}
            className={`nav-link ${router.pathname.startsWith("/caregiver") ? "active" : ""}`}
          >
            {t("caregiver")} {!isUnlocked && "🔒"}
          </Link>
          <Link
            href="/activity"
            className={`nav-link ${router.pathname === "/activity" ? "active" : ""}`}
          >
            {t("activity")}
          </Link>
          <Link
            href="/settings"
            onClick={(e) => navigateProtected(e, "/settings")}
            className={`nav-link ${router.pathname === "/settings" ? "active" : ""}`}
          >
            {t("settings")} {!isUnlocked && "🔒"}
          </Link>
        </div>

        <div className="nav-controls">
          <button className="nav-btn" onClick={toggleLang} title="Toggle English / Sinhala">
            🌐 {lang === "en" ? "සිංහල" : "English"}
          </button>
          <button className="nav-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
          {isUnlocked && (
            <button
              className="nav-btn"
              onClick={() => {
                setIsUnlocked(false);
                showToast("Caregiver views locked", "warn");
                if (router.pathname.startsWith("/caregiver") || router.pathname.startsWith("/settings")) {
                  router.push("/");
                }
              }}
              title="Lock Caregiver & Settings"
            >
              🔒 Lock
            </button>
          )}
        </div>
      </nav>

      <div className="container">
        <Component {...pageProps} />
      </div>

      {/* Floating Toast Notification Stack */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">
              {toast.type === "success" ? "✅" : toast.type === "warn" ? "⚠️" : "ℹ️"}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{toast.message}</div>
            </div>
          </div>
        ))}
      </div>

      {/* PIN Authentication Modal */}
      {pinModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>🔒 {t("pinTitle")}</h2>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              Protected health area. Enter your 4-digit caregiver PIN (default: <strong>1234</strong>).
            </p>
            <form onSubmit={handlePinSubmit}>
              <div className="pin-inputs">
                {[0, 1, 2, 3].map((idx) => (
                  <input
                    key={idx}
                    id={`pin-${idx}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    className="pin-digit"
                    value={pinDigits[idx]}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>
              {pinError && <p style={{ color: "var(--danger)", fontSize: 14 }}>{pinError}</p>}
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
                <button type="submit" className="btn btn-primary">
                  {t("unlock")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
