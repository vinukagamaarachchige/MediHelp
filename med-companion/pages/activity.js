import { useEffect, useState } from "react";
import { useApp } from "./_app";

export default function ActivityLogPage() {
  const { t, showToast } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  async function loadLogs() {
    try {
      const res = await fetch("/api/activity");
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  async function clearLogs() {
    if (!confirm("Are you sure you want to clear the agent activity logs?")) return;
    try {
      const res = await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (res.ok) {
        showToast("Activity logs cleared", "success");
        loadLogs();
      }
    } catch (e) {
      showToast("Failed to clear logs", "warn");
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading agent activity logs…</p>;

  const filteredLogs = filterType === "all" ? logs : logs.filter((l) => l.type === filterType);

  const TYPE_META = {
    plan: { label: "PLAN", icon: "📋", color: "var(--accent)", bg: "var(--accent-light)" },
    monitor: { label: "MONITOR", icon: "🔍", color: "#6b7280", bg: "#f3f4f6" },
    escalate: { label: "ESCALATE", icon: "🚨", color: "var(--danger)", bg: "var(--danger-bg)" },
    replan: { label: "RE-PLAN", icon: "🔄", color: "var(--warn)", bg: "var(--warn-bg)" },
    intake: { label: "INTAKE", icon: "📥", color: "#8b5cf6", bg: "#f3e8ff" },
    action: { label: "ACTION", icon: "👤", color: "var(--ok)", bg: "var(--ok-bg)" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h1>🤖 {t("activity")}</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "calc(14px * var(--font-scale, 1))" }}>
            Full autonomous agent trail: Plan → Monitor → Escalate → Re-plan
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={loadLogs} style={{ fontSize: "calc(13px * var(--font-scale, 1))" }}>
            🔄 Refresh
          </button>
          <button className="btn btn-secondary" onClick={clearLogs} style={{ fontSize: "calc(13px * var(--font-scale, 1))", color: "var(--danger)" }}>
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {["all", "plan", "monitor", "escalate", "replan", "intake", "action"].map((typ) => (
          <button
            key={typ}
            className={`btn ${filterType === typ ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "calc(12px * var(--font-scale, 1))", padding: "6px 12px", textTransform: "capitalize" }}
            onClick={() => setFilterType(typ)}
          >
            {typ === "all" ? "All Events" : `${TYPE_META[typ]?.icon || ""} ${typ}`}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <p style={{ color: "var(--muted)" }}>No agent activity events recorded yet.</p>
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 24, borderLeft: "2px solid var(--border)" }}>
          {filteredLogs.map((log) => {
            const meta = TYPE_META[log.type] || TYPE_META.action;
            return (
              <div
                key={log.id}
                style={{
                  position: "relative",
                  marginBottom: 18,
                }}
              >
                {/* Timeline node dot */}
                <div
                  style={{
                    position: "absolute",
                    left: -33,
                    top: 14,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: meta.color,
                    border: "3px solid var(--bg)",
                  }}
                />

                <div className="card" style={{ marginBottom: 0, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: "calc(11px * var(--font-scale, 1))",
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: meta.bg,
                          color: meta.color,
                          letterSpacing: 0.5,
                        }}
                      >
                        {meta.icon} {meta.label}
                      </span>
                      <strong style={{ fontSize: "calc(15px * var(--font-scale, 1))" }}>{log.message}</strong>
                    </div>
                    <span style={{ fontSize: "calc(12px * var(--font-scale, 1))", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>

                  {log.details && Object.keys(log.details).length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: "calc(12px * var(--font-scale, 1))", color: "var(--muted)" }}>
                        Event Payload &amp; Trace Details
                      </summary>
                      <pre
                        style={{
                          background: "var(--card-subtle)",
                          padding: 10,
                          borderRadius: 6,
                          fontSize: "calc(12px * var(--font-scale, 1))",
                          overflowX: "auto",
                          margin: "6px 0 0",
                        }}
                      >
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
