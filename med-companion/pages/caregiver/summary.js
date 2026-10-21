import { useEffect, useState } from "react";
import Link from "next/link";
import { DISCLAIMER } from "../../lib/safety";

export default function PharmacistSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      try {
        const [settingsRes, medsRes, schedRes, histRes, alertsRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/medications"),
          fetch("/api/schedule"),
          fetch("/api/schedule?range=history"),
          fetch("/api/alerts"),
        ]);

        const settings = await settingsRes.json();
        const meds = await medsRes.json();
        const sched = await schedRes.json();
        const hist = await histRes.json();
        const alerts = await alertsRes.json();

        setData({
          person: settings.person || {},
          caregivers: settings.caregivers || [],
          medications: (meds.medications || []).filter((m) => !m.retired),
          interactions: meds.interactions || [],
          todayDoses: Array.isArray(sched) ? sched : [],
          history: Array.isArray(hist) ? hist : [],
          alerts: Array.isArray(alerts) ? alerts : [],
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>Generating pharmacist summary…</p>;
  if (!data) return <p style={{ padding: 20 }}>Error loading summary data.</p>;

  const totalWeekDoses = data.history.reduce((acc, h) => acc + h.total, 0);
  const takenWeekDoses = data.history.reduce((acc, h) => acc + h.taken, 0);
  const weekAdherence = totalWeekDoses > 0 ? Math.round((takenWeekDoses / totalWeekDoses) * 100) : "N/A";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "10px 0" }}>
      {/* Action Bar (hidden when printing) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          padding: 12,
          background: "var(--card-subtle)",
          borderRadius: 10,
        }}
      >
        <Link href="/caregiver" className="btn btn-secondary" style={{ textDecoration: "none" }}>
          ← Back to Caregiver View
        </Link>
        <button
          className="btn btn-primary"
          onClick={() => window.print()}
          style={{ fontSize: "calc(15px * var(--font-scale, 1))" }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* Printable Document Sheet */}
      <div
        className="card"
        style={{
          padding: 32,
          background: "white",
          color: "#111",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <div style={{ borderBottom: "2px solid #2563eb", paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "calc(24px * var(--font-scale, 1))", color: "#1e3a8a" }}>
                PHARMACIST & CLINICAL CONSULTATION SUMMARY
              </h1>
              <p style={{ margin: "4px 0 0", color: "#666", fontSize: "calc(13px * var(--font-scale, 1))" }}>
                Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
              </p>
            </div>
            <span
              style={{
                background: "#dbeafe",
                color: "#1e40af",
                padding: "6px 12px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: "calc(12px * var(--font-scale, 1))",
              }}
            >
              CONFIDENTIAL HEALTH SUMMARY
            </span>
          </div>
        </div>

        {/* Patient Profile & Routine Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            background: "#f9fafb",
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
            fontSize: "calc(13px * var(--font-scale, 1))",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "calc(14px * var(--font-scale, 1))", color: "#374151" }}>Patient Information</h3>
            <p style={{ margin: "2px 0" }}><strong>Name:</strong> {data.person.name || "Elder"}</p>
            <p style={{ margin: "2px 0" }}>
              <strong>Routine Anchor Times:</strong> Breakfast {data.person.breakfast}, Lunch {data.person.lunch}, Dinner {data.person.dinner}, Sleep {data.person.sleep}
            </p>
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "calc(14px * var(--font-scale, 1))", color: "#374151" }}>Primary Caregiver Contact</h3>
            {data.caregivers[0] ? (
              <>
                <p style={{ margin: "2px 0" }}>
                  <strong>Name:</strong> {data.caregivers[0].name} ({data.caregivers[0].relationship || "Primary"})
                </p>
                <p style={{ margin: "2px 0" }}>
                  <strong>Phone:</strong> {data.caregivers[0].phone || "—"}
                </p>
              </>
            ) : (
              <p style={{ margin: "2px 0" }}>No caregiver specified.</p>
            )}
          </div>
        </div>

        {/* Active Medications Table */}
        <h2 style={{ fontSize: "calc(16px * var(--font-scale, 1))", margin: "0 0 10px", color: "#111" }}>
          Current Active Medications ({data.medications.length})
        </h2>
        {data.medications.length === 0 ? (
          <p style={{ fontSize: "calc(13px * var(--font-scale, 1))", color: "#666" }}>No active medications recorded.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "calc(13px * var(--font-scale, 1))", marginBottom: 24 }}>
            <thead>
              <tr style={{ background: "#f3f4f6", borderBottom: "2px solid #ccc" }}>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Medication</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Strength & Dose</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Frequency & Timing</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Prescriber</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>Criticality</th>
              </tr>
            </thead>
            <tbody>
              {data.medications.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: "8px 10px" }}>{m.strength} {m.dose ? `(${m.dose})` : ""}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {m.frequency} — {m.timing === "with_food" ? "With Food" : m.timing === "empty_stomach" ? "Empty Stomach" : "Any Time"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{m.doctor || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span
                      style={{
                        fontSize: "calc(11px * var(--font-scale, 1))",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: m.criticality === "critical" ? "#fee2e2" : "#f3f4f6",
                        color: m.criticality === "critical" ? "#b91c1c" : "#374151",
                        fontWeight: 600,
                      }}
                    >
                      {m.criticality.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 7-Day Compliance & Adherence Stats */}
        <h2 style={{ fontSize: "calc(16px * var(--font-scale, 1))", margin: "0 0 10px", color: "#111" }}>
          7-Day Adherence & Compliance Report
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            background: "#f9fafb",
            padding: 14,
            borderRadius: 8,
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "calc(24px * var(--font-scale, 1))", fontWeight: 700, color: "#16a34a" }}>
              {weekAdherence !== "N/A" ? `${weekAdherence}%` : "—"}
            </div>
            <div style={{ fontSize: "calc(12px * var(--font-scale, 1))", color: "#666" }}>7-Day Adherence Rate</div>
          </div>
          <div>
            <div style={{ fontSize: "calc(24px * var(--font-scale, 1))", fontWeight: 700, color: "#2563eb" }}>
              {takenWeekDoses} / {totalWeekDoses}
            </div>
            <div style={{ fontSize: "calc(12px * var(--font-scale, 1))", color: "#666" }}>Doses Taken / Total</div>
          </div>
          <div>
            <div style={{ fontSize: "calc(24px * var(--font-scale, 1))", fontWeight: 700, color: "#dc2626" }}>
              {data.alerts.length}
            </div>
            <div style={{ fontSize: "calc(12px * var(--font-scale, 1))", color: "#666" }}>Logged Missed Alerts</div>
          </div>
        </div>

        {/* Pharmacist Questions & Drug Interaction Inquiries */}
        {data.interactions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "calc(16px * var(--font-scale, 1))", margin: "0 0 10px", color: "#b91c1c" }}>
              ⚠️ Drug Interaction Points for Pharmacist / Doctor Review
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.interactions.map((int, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    borderRadius: 6,
                    padding: "10px 14px",
                    fontSize: "calc(13px * var(--font-scale, 1))",
                  }}
                >
                  <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#991b1b" }}>
                    Combination: {int.medicationA} + {int.medicationB} ({int.severity.toUpperCase()} RISK)
                  </p>
                  <p style={{ margin: "0 0 6px", color: "#4b5563" }}>{int.mechanism}</p>
                  <p style={{ margin: 0, fontWeight: 600, color: "#1e40af" }}>
                    Suggested Pharmacist Inquiry: &ldquo;{int.pharmacistQuestion}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Medical Sign-off and Disclaimer */}
        <div style={{ borderTop: "1px solid #ccc", paddingTop: 14, marginTop: 24, fontSize: "calc(11px * var(--font-scale, 1))", color: "#777" }}>
          <p style={{ margin: 0 }}>
            {DISCLAIMER}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30 }}>
            <div>Pharmacist Signature: ___________________________</div>
            <div>Date: _______________</div>
          </div>
        </div>
      </div>
    </div>
  );
}
