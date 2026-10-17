import { useEffect, useState } from "react";
import { DISCLAIMER } from "../lib/safety";
import { useApp } from "./_app";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const { t, showToast } = useApp();
  const [doses, setDoses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [actionDoseId, setActionDoseId] = useState(null);

  async function load() {
    try {
      const res = await fetch("/api/schedule");
      const data = await res.json();
      setDoses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load schedule", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(doseId, status) {
    setActionDoseId(doseId);
    try {
      const res = await fetch(`/api/doses/${doseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        if (status === "taken") {
          showToast(t("doseTakenToast"), "success");
        } else {
          showToast(t("doseSkippedToast"), "warn");
        }
      }
    } catch (err) {
      showToast("Error updating status", "warn");
    } finally {
      setActionDoseId(null);
      load();
    }
  }

  // Advance time button to demo missed-dose escalation
  async function checkMissed() {
    setChecking(true);
    try {
      const res = await fetch("/api/doses/check-missed", { method: "POST" });
      const { newAlerts } = await res.json();
      load();
      if (newAlerts && newAlerts.length > 0) {
        showToast(
          `${newAlerts.length} dose(s) became missed and escalated to caregiver.`,
          "warn"
        );
      } else {
        showToast("No new missed doses. All on track!", "success");
      }
    } catch (e) {
      showToast("Check failed", "warn");
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading schedule…</p>;

  return (
    <div className={simpleMode ? "simple-mode" : ""}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
          gap: 12,
        }}
      >
        <h1>{t("today")}</h1>
        <button
          className="btn btn-secondary"
          onClick={() => setSimpleMode(!simpleMode)}
          style={{ fontSize: simpleMode ? 20 : 14, padding: simpleMode ? "14px 24px" : "8px 16px" }}
        >
          {simpleMode ? `👓 ${t("normalMode")}` : `👴 ${t("simpleMode")}`}
        </button>
      </div>

      {!simpleMode && <div className="disclaimer">{DISCLAIMER}</div>}

      {doses.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: simpleMode ? 26 : 18 }}>{t("noDosesToday")}</p>
        </div>
      )}

      {doses.map((dose) => {
        const isCurrentAction = actionDoseId === dose.id;
        const timingLabel =
          dose.medication?.timing === "with_food"
            ? t("withFood")
            : dose.medication?.timing === "empty_stomach"
            ? t("emptyStomach")
            : t("anyTime");

        return (
          <div
            className="card"
            key={dose.id}
            style={{
              borderLeft:
                dose.status === "taken"
                  ? "6px solid var(--ok)"
                  : dose.status === "missed"
                  ? "6px solid var(--danger)"
                  : dose.status === "skipped"
                  ? "6px solid var(--warn)"
                  : "6px solid var(--accent)",
            }}
          >
            <div className="dose-row">
              <div>
                <div className="dose-time">{formatTime(dose.scheduledTime)}</div>
                <div className="dose-name">{dose.medication?.name}</div>
                <div className="dose-sub">
                  {dose.medication?.strength} {dose.medication?.dose ? `· ${dose.medication.dose}` : ""} ·{" "}
                  {timingLabel}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`status-pill status-${dose.status}`}>
                    {t(dose.status) || dose.status}
                  </span>
                  {dose.medication?.criticality === "critical" && (
                    <span
                      className="status-pill status-missed"
                      style={{ marginLeft: 8 }}
                    >
                      {t("critical")}
                    </span>
                  )}
                </div>
              </div>

              {dose.status === "pending" && (
                <div style={{ display: "flex", gap: simpleMode ? 16 : 10, marginTop: simpleMode ? 16 : 0 }}>
                  <button
                    className="btn btn-taken"
                    onClick={() => setStatus(dose.id, "taken")}
                    disabled={isCurrentAction}
                  >
                    ✓ {t("taken")}
                  </button>
                  <button
                    className="btn btn-skip"
                    onClick={() => setStatus(dose.id, "skipped")}
                    disabled={isCurrentAction}
                  >
                    ✕ {t("skip")}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {!simpleMode && (
        <>
          <h2>{t("demoTools")}</h2>
          <div className="card">
            <p className="dose-sub" style={{ marginBottom: 12 }}>
              In real use, missed-dose checks run on a background timer. For testing, simulate the clock:
            </p>
            <button className="btn btn-primary" onClick={checkMissed} disabled={checking}>
              ⏱️ {checking ? "Checking…" : t("checkMissedBtn")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
