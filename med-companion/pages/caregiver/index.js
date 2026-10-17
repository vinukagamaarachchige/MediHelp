import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_app";

export default function CaregiverDashboard() {
  const { t, showToast } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [doses, setDoses] = useState([]);
  const [history, setHistory] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter and sort state
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "unack" | "ack"
  const [sortBy, setSortBy] = useState("newest"); // "newest" | "criticality" | "medication"
  const [medSearch, setMedSearch] = useState("");

  async function loadData() {
    try {
      const [alertsRes, schedRes, histRes, medsRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/schedule"),
        fetch("/api/schedule?range=history"),
        fetch("/api/medications"),
      ]);

      const alertsData = await alertsRes.json();
      const schedData = await schedRes.json();
      const histData = await histRes.json();
      const medsData = await medsRes.json();

      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setDoses(Array.isArray(schedData) ? schedData : []);
      setHistory(Array.isArray(histData) ? histData : []);
      setInteractions(medsData.interactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function acknowledge(id) {
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Alert acknowledged", "success");
        loadData();
      }
    } catch (e) {
      showToast("Failed to acknowledge", "warn");
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading caregiver dashboard…</p>;

  const takenToday = doses.filter((d) => d.status === "taken").length;
  const totalToday = doses.length;
  const adherencePct = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : null;

  // Filter alerts
  let filteredAlerts = [...alerts];
  if (statusFilter === "unack") {
    filteredAlerts = filteredAlerts.filter((a) => !a.acknowledged);
  } else if (statusFilter === "ack") {
    filteredAlerts = filteredAlerts.filter((a) => a.acknowledged);
  }

  if (medSearch.trim()) {
    const q = medSearch.toLowerCase();
    filteredAlerts = filteredAlerts.filter((a) => (a.medicationName || "").toLowerCase().includes(q));
  }

  // Sort alerts
  if (sortBy === "criticality") {
    filteredAlerts.sort((a, b) => (b.criticality === "critical" ? 1 : 0) - (a.criticality === "critical" ? 1 : 0));
  } else if (sortBy === "medication") {
    filteredAlerts.sort((a, b) => (a.medicationName || "").localeCompare(b.medicationName || ""));
  } else {
    filteredAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1>🛡️ {t("caregiver")}</h1>
        <Link
          href="/caregiver/summary"
          className="btn btn-secondary"
          style={{ textDecoration: "none", fontSize: 14 }}
        >
          📄 {t("pharmacistSummary")} (Print / PDF)
        </Link>
      </div>

      {/* 7-Day Adherence Chart */}
      <h2>📊 {t("adherence7Days")}</h2>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 26, fontWeight: 700, color: "var(--accent)" }}>
              {adherencePct !== null ? `${adherencePct}%` : "—"}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 8 }}>
              {adherencePct !== null ? `today (${takenToday}/${totalToday} doses)` : "No doses scheduled today"}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Past 7 Days History</span>
        </div>

        {/* SVG Bar Chart */}
        <div className="chart-container" style={{ width: "100%", overflowX: "auto" }}>
          <svg viewBox="0 0 560 170" width="100%" height="170" style={{ overflow: "visible" }}>
            {/* Horizontal guideline */}
            <line x1="30" y1="120" x2="540" y2="120" stroke="var(--border)" strokeWidth="1" />
            <line x1="30" y1="30" x2="540" y2="30" stroke="var(--border)" strokeDasharray="3 3" strokeWidth="1" />
            <text x="5" y="34" fontSize="10" fill="var(--muted)">100%</text>
            <text x="15" y="124" fontSize="10" fill="var(--muted)">0%</text>

            {history.map((day, idx) => {
              const x = 50 + idx * 70;
              const barWidth = 36;
              const rate = day.rate ?? 0;
              const barHeight = Math.max(4, Math.round((rate / 100) * 90));
              const y = 120 - barHeight;

              let fillColor = "var(--ok)";
              if (day.total === 0) fillColor = "var(--border)";
              else if (rate < 50) fillColor = "var(--danger)";
              else if (rate < 80) fillColor = "var(--warn)";

              return (
                <g key={day.date}>
                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="6"
                    fill={fillColor}
                    className="chart-bar"
                  >
                    <title>{`${day.dayName} (${day.date}): ${rate}% (${day.taken}/${day.total} doses)`}</title>
                  </rect>
                  {/* Percentage label */}
                  {day.total > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--text)"
                    >
                      {rate}%
                    </text>
                  )}
                  {/* Day label */}
                  <text
                    x={x + barWidth / 2}
                    y="142"
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight={idx === 6 ? "700" : "500"}
                    fill={idx === 6 ? "var(--accent)" : "var(--text)"}
                  >
                    {idx === 6 ? "Today" : day.dayName}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y="158"
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--muted)"
                  >
                    {day.taken}/{day.total}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Drug Interactions Panel */}
      {interactions.length > 0 && (
        <>
          <h2>⚠️ {t("interactionsFound")} ({interactions.length})</h2>
          <div className="card" style={{ borderLeft: "6px solid var(--danger)" }}>
            <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px" }}>
              Clinical interactions flagged between active medications. Phrased as non-directive pharmacist inquiry points:
            </p>
            {interactions.map((int, i) => (
              <div
                key={i}
                style={{
                  background: "var(--card-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 16 }}>
                    {int.medicationA} + {int.medicationB}
                  </strong>
                  <span
                    className={`status-pill ${
                      int.severity === "high" ? "status-missed" : "status-skipped"
                    }`}
                  >
                    {int.severity} risk
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 10px" }}>
                  {int.mechanism}
                </p>
                <div
                  style={{
                    background: "var(--accent-light)",
                    border: "1px solid var(--accent)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 14,
                    color: "var(--text)",
                    lineHeight: 1.4,
                  }}
                >
                  💬 <strong>Pharmacist Question:</strong> {int.pharmacistQuestion}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Alerts & Escalations Feed */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginTop: 28 }}>
        <h2>🚨 {t("alerts")} ({filteredAlerts.length})</h2>
      </div>

      {/* Alert Filter and Sort Toolbar */}
      <div
        className="card"
        style={{
          padding: "12px 16px",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          background: "var(--card-subtle)",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`btn ${statusFilter === "all" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: 13, padding: "6px 12px" }}
            onClick={() => setStatusFilter("all")}
          >
            All ({alerts.length})
          </button>
          <button
            className={`btn ${statusFilter === "unack" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: 13, padding: "6px 12px" }}
            onClick={() => setStatusFilter("unack")}
          >
            Unacknowledged ({alerts.filter((a) => !a.acknowledged).length})
          </button>
          <button
            className={`btn ${statusFilter === "ack" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: 13, padding: "6px 12px" }}
            onClick={() => setStatusFilter("ack")}
          >
            Acknowledged
          </button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ fontSize: 13, padding: "6px 10px", width: "auto", marginBottom: 0 }}
          >
            <option value="newest">Sort: Newest First</option>
            <option value="criticality">Sort: Critical First</option>
            <option value="medication">Sort: By Medication Name</option>
          </select>

          <input
            placeholder="Search medication…"
            value={medSearch}
            onChange={(e) => setMedSearch(e.target.value)}
            style={{ fontSize: 13, padding: "6px 10px", width: 170, marginBottom: 0 }}
          />
        </div>
      </div>

      {filteredAlerts.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          {t("noAlerts")}
        </div>
      )}

      {filteredAlerts.map((a) => (
        <div
          className="card"
          key={a.id}
          style={{
            borderLeft: a.acknowledged
              ? "6px solid var(--ok)"
              : a.criticality === "critical"
              ? "6px solid var(--danger)"
              : "6px solid var(--warn)",
          }}
        >
          <div className="dose-row">
            <div>
              <strong>{a.medicationName}</strong> — {a.type === "refill_low" ? (a.message || `Low supply: ${a.pillsRemaining} pills remaining`) : "missed dose"}
              {a.criticality === "critical" && (
                <span className="status-pill status-missed" style={{ marginLeft: 8 }}>
                  critical
                </span>
              )}
              <div className="dose-sub">{new Date(a.timestamp).toLocaleString()}</div>

              {/* Expandable Agent Activity Log */}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                  🤖 {t("agentActivityLog")}
                </summary>
                <ul style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0", paddingLeft: 20 }}>
                  {a.log?.map((entry, i) => (
                    <li key={i}>
                      <code>{entry.step}</code> — {new Date(entry.at).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </details>
            </div>

            {!a.acknowledged ? (
              <button className="btn btn-primary" onClick={() => acknowledge(a.id)}>
                {t("acknowledge")}
              </button>
            ) : (
              <span className="status-pill status-taken">✓ {t("acknowledged")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
