import Reminders from "../components/Reminders";
import { daysRemaining } from "../lib/supply";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DISCLAIMER } from "../lib/safety";
import { useApp } from "./_app";
import { speakDoseReminder, speakDoubleDoseWarning, playChime } from "../lib/tts";
import { getPillColorHex, getRoutineBucket, getBucketMeta, routineLabel } from "../lib/pills";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const { t, lang, showToast } = useApp();
  const [doses, setDoses] = useState([]);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [viewMode, setViewMode] = useState("buckets"); // "buckets" | "timeline"
  const [actionDoseId, setActionDoseId] = useState(null);
  const [listening, setListening] = useState(null);
  async function voiceConfirm(dose) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return showToast("Voice confirmation is unavailable in this browser. Use Taken.", "warn");
    const recognition = new Recognition();
    recognition.lang = lang === "si" ? "si-LK" : "en-US";
    recognition.interimResults = false;
    setListening(dose.id);
    recognition.onresult = event => {
      const phrase = event.results[0][0].transcript.trim().toLowerCase().replace(/[.!?。]$/, "");
      if (["taken", "ගත්තා"].includes(phrase)) setStatus(dose.id, "taken");
      else showToast("Not confirmed. Say Taken / ගත්තා, or use the Taken button.", "warn");
    };
    recognition.onerror = () => showToast("Microphone unavailable. Use the Taken button.", "warn");
    recognition.onend = () => setListening(null);
    recognition.start();
  }

  // Double-Dose Protection Modal State
  const [doubleDoseModal, setDoubleDoseModal] = useState(null);

  async function loadData() {
    try {
      const [schedRes, medsRes] = await Promise.all([
        fetch("/api/schedule"),
        fetch("/api/medications"),
      ]);
      const schedData = await schedRes.json();
      const medsData = await medsRes.json();

      setDoses(Array.isArray(schedData) ? schedData : []);
      setMedications(medsData.medications || []);
    } catch (err) {
      console.error("Failed to load schedule", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function setStatus(doseId, status) {
    setActionDoseId(doseId);
    try {
      const res = await fetch(`/api/doses/${doseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const error = await res.json(); throw new Error(error.error); }
      if (res.ok) {
        if (status === "taken") {
          playChime("success");
          showToast(t("doseTakenToast"), "success");
        } else {
          showToast(t("doseSkippedToast"), "warn");
        }
      }
    } catch (err) {
      showToast("Error updating status", "warn");
    } finally {
      setActionDoseId(null);
      loadData();
    }
  }

  // Handle double-dose tap on an already-taken dose
  function handleTakenDoseClick(dose) {
    const med = dose.medication || {};
    const takenAt = dose.confirmedAt ? formatTime(dose.confirmedAt) : "earlier today";

    // Find next pending dose for this medication today
    const nextPending = doses.find(
      (d) => d.medicationId === dose.medicationId && d.status === "pending" && new Date(d.scheduledTime) > new Date(dose.scheduledTime)
    );
    const nextTime = nextPending ? formatTime(nextPending.scheduledTime) : "tomorrow";

    speakDoubleDoseWarning({
      medicationName: med.name || "Medication",
      takenAt,
      nextTime,
      lang,
    });

    setDoubleDoseModal({
      medicationName: med.name || "Medication",
      takenAt,
      nextTime,
      dose,
    });
  }

  // Trigger voice readout
  function handleVoiceReadout(dose) {
    const med = dose.medication || {};
    const timingLabel = routineLabel(dose, med, lang);

    speakDoseReminder({
      medicationName: med.name,
      strength: med.strength,
      dose: med.dose || "1 tablet",
      timingLabel,
      time: formatTime(dose.scheduledTime),
      pillColor: med.pillColor || "white",
      pillShape: med.pillShape || "round",
      lang,
    });
  }

  // Advance time button to demo missed-dose escalation
  async function checkMissed() {
    setChecking(true);
    try {
      const res = await fetch("/api/doses/check-missed", { method: "POST" });
      const { newAlerts } = await res.json();
      loadData();
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

  // Check for medications running low on supply (<= 5 remaining)
  const lowSupplyMeds = medications.filter(
    (m) => !m.retired && daysRemaining(m) !== null && daysRemaining(m) <= 5
  );

  // Group doses into routine buckets (morning, afternoon, evening, night)
  const buckets = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  doses.forEach((dose) => {
    const bKey = getRoutineBucket(dose.scheduledTime);
    if (buckets[bKey]) {
      buckets[bKey].push(dose);
    } else {
      buckets.morning.push(dose);
    }
  });

  // Render an individual dose card
  function renderDoseCard(dose) {
    const med = dose.medication || {};
    const isCurrentAction = actionDoseId === dose.id;
    const isTaken = dose.status === "taken";
    const timingLabel = routineLabel(dose, med, lang);

    const colorMeta = getPillColorHex(med.pillColor);
    const pillShapeClass =
      med.pillShape === "capsule"
        ? "pill-shape-capsule"
        : med.pillShape === "oval"
        ? "pill-shape-oval"
        : "pill-shape-round";

    // Double-Dose Protection Card if already taken
    if (isTaken) {
      return (
        <div
          className="card dose-locked-card"
          key={dose.id}
          onClick={() => handleTakenDoseClick(dose)}
          title="Click to check dose status"
        >
          <div className="dose-row">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🛡️</span>
                <strong style={{ fontSize: simpleMode ? 26 : 20, color: "var(--ok)" }}>
                  {t("doubleDoseLocked")}
                </strong>
                <span className="status-pill status-taken">✓ {formatTime(dose.confirmedAt || dose.scheduledTime)}</span>
              </div>
              <div className="dose-name" style={{ marginTop: 6, fontSize: simpleMode ? 28 : 20 }}>
                {med.name} {med.strength && `(${med.strength})`}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: simpleMode ? 18 : 13, color: "var(--ok)", fontWeight: 600 }}>
                {t("doNotTakeAgain")} {doses.find(d => d.medicationId === dose.medicationId && d.status === "pending" && new Date(d.scheduledTime) > new Date(dose.scheduledTime)) ? formatTime(doses.find(d => d.medicationId === dose.medicationId && d.status === "pending" && new Date(d.scheduledTime) > new Date(dose.scheduledTime)).scheduledTime) : (lang === "si" ? "හෙට" : "Next scheduled day") }
              </p>
            </div>
            <button
              className="btn-voice"
              style={{ fontSize: 13 }}
              onClick={(e) => {
                e.stopPropagation();
                handleTakenDoseClick(dose);
              }}
            >
              🔒 Check
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="card"
        key={dose.id}
        style={{
          borderLeft:
            dose.status === "missed"
              ? "6px solid var(--danger)"
              : dose.status === "skipped"
              ? "6px solid var(--warn)"
              : "6px solid var(--accent)",
        }}
      >
        <div className="dose-row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {med.pillPhoto && <img src={med.pillPhoto} alt="Pill or blister pack reference" style={{ width: 80, height: 80, objectFit: "contain" }} />}
              <div className="dose-time">{timingLabel}<small style={{display:"block"}}>{formatTime(dose.scheduledTime)}</small></div>

              {/* Visual Pill Badge (Color & Shape) */}
              <div className="pill-badge">
                <span
                  className={`pill-shape-icon ${pillShapeClass}`}
                  style={{
                    backgroundColor: colorMeta.hex,
                    border: `1px solid ${colorMeta.border}`,
                  }}
                />
                <span>
                  {med.pillColor ? med.pillColor.toUpperCase() : "WHITE"} {med.pillShape || "TABLET"}
                </span>
              </div>

              {/* Voice Readout Button */}
              <button
                className="btn-voice"
                onClick={() => handleVoiceReadout(dose)}
                title="Listen to dose reminder aloud"
              >
                🔊 {t("readAloud")}
              </button>
            </div>

            <div className="dose-name" style={{ marginTop: 8 }}>
              {med.name} {med.pillImprint && <small> · {med.pillImprint}</small>}
            </div>

            <div className="dose-sub">
              {med.strength} {med.dose ? `· ${med.dose}` : ""} · {timingLabel}
            </div>

            <div style={{ marginTop: 8 }}>
              <span className={`status-pill status-${dose.status}`}>
                {t(dose.status) || dose.status}
              </span>
              {med.criticality === "critical" && (
                <span className="status-pill status-missed" style={{ marginLeft: 8 }}>
                  {t("critical")}
                </span>
              )}
            </div>
          </div>

          {dose.status === "pending" && (
            <div style={{ display: "flex", gap: simpleMode ? 16 : 10, marginTop: simpleMode ? 16 : 0 }}>
              <button className="btn btn-secondary" disabled={!!listening || !!actionDoseId} onClick={() => voiceConfirm(dose)}>{listening === dose.id ? "Listening…" : "🎤 Taken / ගත්තා"}</button>
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
  }

  return (
    <div className={simpleMode ? "simple-mode" : ""}>
      {/* Header with Simple Mode & View Mode Toggles */}
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
        <h1>{t("today")}</h1><Reminders />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View mode toggle */}
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: "8px 14px" }}
            onClick={() => setViewMode(viewMode === "buckets" ? "timeline" : "buckets")}
          >
            {viewMode === "buckets" ? `🕒 ${t("timelineView")}` : `🌅 ${t("bucketView")}`}
          </button>

          {/* Simple Mode Toggle */}
          <button
            className="btn btn-secondary"
            onClick={() => setSimpleMode(!simpleMode)}
            style={{ fontSize: simpleMode ? 20 : 14, padding: simpleMode ? "14px 24px" : "8px 16px" }}
          >
            {simpleMode ? `👓 ${t("normalMode")}` : `👴 ${t("simpleMode")}`}
          </button>
        </div>
      </div>

      {!simpleMode && <div className="disclaimer">{DISCLAIMER}</div>}

      {/* Low Supply Alert Warning Banner */}
      {lowSupplyMeds.length > 0 && (
        <div
          style={{
            background: "var(--warn-bg)",
            border: "2px solid var(--warn)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <strong>⚠️ {t("lowSupplyWarning")}</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 20, fontSize: 14 }}>
              {lowSupplyMeds.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>: {m.currentSupply} {t("pillsRemaining")}
                </li>
              ))}
            </ul>
          </div>
          <Link href="/pillbox" className="btn btn-primary" style={{ textDecoration: "none", fontSize: 13 }}>
            📦 Open Pill Box Refill
          </Link>
        </div>
      )}

      {doses.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: simpleMode ? 26 : 18 }}>{t("noDosesToday")}</p>
        </div>
      )}

      {/* Routine Buckets View (Morning, Afternoon, Evening, Night) */}
      {viewMode === "buckets" && doses.length > 0 && (
        <div>
          {["morning", "afternoon", "evening", "night"].map((bucketKey) => {
            const bucketDoses = buckets[bucketKey];
            if (bucketDoses.length === 0) return null;
            const meta = getBucketMeta(bucketKey);

            return (
              <div className="routine-bucket-group" key={bucketKey}>
                <div className={`bucket-banner bucket-banner-${bucketKey}`}>
                  <span>
                    {meta.icon} {t(meta.titleKey)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>
                    {meta.timeRange}
                  </span>
                </div>
                {bucketDoses.map((dose) => renderDoseCard(dose))}
              </div>
            );
          })}
        </div>
      )}

      {/* Chronological Timeline View */}
      {viewMode === "timeline" && doses.length > 0 && (
        <div>
          {doses.map((dose) => renderDoseCard(dose))}
        </div>
      )}

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

      {/* Accidental Double-Dose Protection Modal */}
      {doubleDoseModal && (
        <div className="modal-overlay">
          <div
            className="modal-content pulse-warning"
            style={{
              border: "3px solid var(--danger)",
              maxWidth: 480,
              padding: 28,
            }}
          >
            <span style={{ fontSize: 44 }}>🛑</span>
            <h2 style={{ color: "var(--danger)", margin: "10px 0" }}>
              {t("doubleDoseWarningTitle")}
            </h2>
            <div
              style={{
                background: "var(--card-subtle)",
                borderRadius: 10,
                padding: "14px 16px",
                margin: "14px 0",
                fontSize: 15,
                textAlign: "left",
              }}
            >
              <p style={{ margin: "0 0 6px" }}>
                <strong>Medication:</strong> {doubleDoseModal.medicationName}
              </p>
              <p style={{ margin: "0 0 6px", color: "var(--ok)", fontWeight: 700 }}>
                ✓ {t("takenAtTime")}: {doubleDoseModal.takenAt}
              </p>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Next scheduled dose: <strong>{doubleDoseModal.nextTime}</strong>
              </p>
            </div>
            <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
              {t("doubleDoseWarningBody")}
            </p>
            <div style={{ marginTop: 22 }}>
              <button
                className="btn btn-primary"
                style={{ width: "100%", fontSize: 16 }}
                onClick={() => setDoubleDoseModal(null)}
              >
                ✓ I Understand (Do Not Retake)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
