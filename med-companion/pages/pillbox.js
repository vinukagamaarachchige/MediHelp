import { timesPerDay } from "../lib/frequency";
import { anchorTimes } from "../lib/routine";
import { unitsPerDose, daysRemaining } from "../lib/supply";
import { getRoutineBucket } from "../lib/pills";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "./_app";
import { getPillColorHex } from "../lib/pills";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function PillboxAssistant() {
  const { t, showToast, isUnlocked, requestUnlock } = useApp();
  const [medications, setMedications] = useState([]);
  const [person, setPerson] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [refillingMedId, setRefillingMedId] = useState(null);

  async function loadMedications() {
    try {
      const settings = await fetch("/api/settings").then(r => r.json()).catch(() => ({}));
      setPerson(settings.person || {});
      const res = await fetch("/api/medications?active=true");
      if (res.ok) {
        const data = await res.json();
        if (data.routine) setPerson(data.routine);
        setMedications(data.medications || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMedications();
  }, []);

  async function handleRestock(med, additionalPills = 30) {
    if (!navigator.onLine) return showToast("Reconnect before changing supply.", "warn");
    if (!isUnlocked) return requestUnlock("/pillbox");
    setRefillingMedId(med.id);
    const newSupply = (med.currentSupply || 0) + additionalPills;
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSupply: newSupply }),
      });
      if (res.ok) {
        showToast(`Restocked ${med.name}! Remaining supply: ${newSupply} pills.`, "success");
        loadMedications();
      }
    } catch (e) {
      showToast("Error updating supply", "warn");
    } finally {
      setRefillingMedId(null);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading Pill Box Assistant…</p>;

  const activeMeds = medications.filter((m) => !m.retired);
  const activeMed = activeMeds[currentStep] || activeMeds[0];

  // Helper to determine which slots should receive a pill based on frequency
  function slotDoseCount(med, slotTime) {
    if (!med) return 0;
    return anchorTimes(person, med.timing, timesPerDay(med.frequency)).filter(time => {
      const date = new Date(); const [h,m] = time.split(":"); date.setHours(Number(h), Number(m));
      const bucket = getRoutineBucket(date);
      return (bucket === "evening" ? "night" : bucket) === slotTime;
    }).length;
  }

  const activeColorMeta = activeMed ? getPillColorHex(activeMed.pillColor) : getPillColorHex("white");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1>📦 {t("pillboxTitle")}</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "calc(14px * var(--font-scale, 1))" }}>
            Step-by-step physical 7-day pill organizer loader &amp; supply tracker
          </p>
        </div>
        <Link href="/" className="btn btn-secondary" style={{ textDecoration: "none", fontSize: "calc(14px * var(--font-scale, 1))" }}>
          ← Back to Today
        </Link>
      </div>

      {activeMeds.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p>No active medications to load. Please add a prescription first.</p>
          <Link href="/prescription/new" className="btn btn-primary" style={{ textDecoration: "none", marginTop: 10 }}>
            + Add Prescription
          </Link>
        </div>
      ) : (
        <>
          {/* Step Wizard Header */}
          <div className="card" style={{ background: "var(--accent-light)", border: "2px solid var(--accent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontSize: "calc(13px * var(--font-scale, 1))", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)" }}>
                Step {currentStep + 1} of {activeMeds.length}: Load Medication
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  disabled={currentStep === 0}
                  onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  style={{ fontSize: "calc(13px * var(--font-scale, 1))", padding: "6px 14px" }}
                >
                  ← Previous
                </button>
                <button
                  className="btn btn-primary"
                  disabled={currentStep === activeMeds.length - 1}
                  onClick={() => setCurrentStep(Math.min(activeMeds.length - 1, currentStep + 1))}
                  style={{ fontSize: "calc(13px * var(--font-scale, 1))", padding: "6px 14px" }}
                >
                  Next Medication →
                </button>
              </div>
            </div>

            {/* Instruction Callout */}
            {activeMed && (
              <div style={{ marginTop: 16 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: "calc(24px * var(--font-scale, 1))", color: "var(--text)" }}>
                  Take bottle: <strong>{activeMed.name}</strong> ({activeMed.strength})
                </h2>

                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0" }}>
                  <span
                    className="pill-shape-icon"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: activeMed.pillShape === "capsule" ? "999px" : activeMed.pillShape === "oval" ? "40%" : "50%",
                      backgroundColor: activeColorMeta.hex,
                      border: `2px solid ${activeColorMeta.border}`,
                    }}
                  />
                  <span style={{ fontSize: "calc(15px * var(--font-scale, 1))", fontWeight: 600 }}>
                    Look for the {activeMed.pillColor?.toUpperCase() || "WHITE"} {activeMed.pillShape?.toUpperCase() || "TABLET"}
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--card)",
                    borderRadius: 10,
                    padding: "14px 18px",
                    border: "1px solid var(--border)",
                    fontSize: "calc(16px * var(--font-scale, 1))",
                    lineHeight: 1.5,
                  }}
                >
                  👉 <strong>Action:</strong> Place <strong>{unitsPerDose(activeMed) ?? activeMed.dose} {unitsPerDose(activeMed) ? "pill(s) per scheduled dose" : ""}</strong> into the highlighted slots on your physical 7-day pill box below ({activeMed.frequency}).
                </div>
              </div>
            )}
          </div>

          {/* Interactive 7-Day Pill Box Visualizer */}
          <h2>🗓️ 7-Day Physical Organizer Layout</h2>
          <div className="card" style={{ padding: 16 }}>
            <div className="pillbox-grid">
              {DAYS_OF_WEEK.map((dayName) => {
                const morningActive = slotDoseCount(activeMed, "morning");
                const afternoonActive = slotDoseCount(activeMed, "afternoon");
                const nightActive = slotDoseCount(activeMed, "night");

                return (
                  <div className="pillbox-col" key={dayName}>
                    <strong style={{ fontSize: "calc(13px * var(--font-scale, 1))", textTransform: "uppercase" }}>{dayName.slice(0, 3)}</strong>

                    {/* Morning slot */}
                    <div
                      className="pillbox-slot"
                      style={{
                        background: morningActive ? activeColorMeta.hex : "var(--card-subtle)",
                        border: morningActive ? `2px solid ${activeColorMeta.border}` : "1px dashed var(--border)",
                        color: morningActive ? "#000" : "var(--muted)",
                        fontWeight: morningActive ? 700 : 400,
                      }}
                    >
                      <span>🌅 Morning</span>
                      {morningActive && <span style={{ fontSize: "calc(13px * var(--font-scale, 1))", marginTop: 2 }}>+{unitsPerDose(activeMed) ? unitsPerDose(activeMed) * morningActive : activeMed.dose}</span>}
                    </div>

                    {/* Afternoon slot */}
                    <div
                      className="pillbox-slot"
                      style={{
                        background: afternoonActive ? activeColorMeta.hex : "var(--card-subtle)",
                        border: afternoonActive ? `2px solid ${activeColorMeta.border}` : "1px dashed var(--border)",
                        color: afternoonActive ? "#000" : "var(--muted)",
                        fontWeight: afternoonActive ? 700 : 400,
                      }}
                    >
                      <span>☀️ Noon</span>
                      {afternoonActive && <span style={{ fontSize: "calc(13px * var(--font-scale, 1))", marginTop: 2 }}>+{unitsPerDose(activeMed) ? unitsPerDose(activeMed) * afternoonActive : activeMed.dose}</span>}
                    </div>

                    {/* Night slot */}
                    <div
                      className="pillbox-slot"
                      style={{
                        background: nightActive ? activeColorMeta.hex : "var(--card-subtle)",
                        border: nightActive ? `2px solid ${activeColorMeta.border}` : "1px dashed var(--border)",
                        color: nightActive ? "#000" : "var(--muted)",
                        fontWeight: nightActive ? 700 : 400,
                      }}
                    >
                      <span>🌙 Night</span>
                      {nightActive && <span style={{ fontSize: "calc(13px * var(--font-scale, 1))", marginTop: 2 }}>+{unitsPerDose(activeMed) ? unitsPerDose(activeMed) * nightActive : activeMed.dose}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pill Supply & Refill Depletion Tracker */}
          <div style={{ marginTop: 28 }}>
            <h2>💊 Remaining Bottle Supply &amp; Refill Status</h2>
            {activeMeds.map((med) => {
              const supply = typeof med.currentSupply === "number" ? med.currentSupply : 0;
              const isLow = daysRemaining(med) !== null && daysRemaining(med) <= 5;
              const pct = Math.min(100, Math.round((supply / 30) * 100));

              return (
                <div
                  className="card"
                  key={med.id}
                  style={{
                    borderLeft: isLow ? "6px solid var(--danger)" : "6px solid var(--ok)",
                  }}
                >
                  <div className="dose-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <strong style={{ fontSize: "calc(18px * var(--font-scale, 1))" }}>{med.name}</strong>
                        {med.strength && <span style={{ color: "var(--muted)" }}>({med.strength})</span>}
                        {isLow && (
                          <span className="status-pill status-missed">LOW SUPPLY ({supply} LEFT)</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: "100%", maxWidth: 380, marginTop: 8 }}>
                        <div style={{ height: 8, background: "var(--card-subtle)", borderRadius: 999, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: isLow ? "var(--danger)" : pct < 40 ? "var(--warn)" : "var(--ok)",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "calc(12px * var(--font-scale, 1))", color: "var(--muted)", marginTop: 4 }}>
                          {supply} pills remaining ({daysRemaining(med) === null ? "unknown" : Math.floor(daysRemaining(med))} days estimated)
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => handleRestock(med, 30)}
                      disabled={refillingMedId === med.id}
                      style={{ fontSize: "calc(14px * var(--font-scale, 1))" }}
                    >
                      {refillingMedId === med.id ? "Updating…" : "+ Refill Bottle (+30 Pills)"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
