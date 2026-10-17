import { useEffect, useState } from "react";
import { useApp } from "./_app";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function WeeklySchedule() {
  const { t } = useApp();
  const [days, setDays] = useState([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadWeek() {
    try {
      const res = await fetch("/api/schedule?range=week");
      const data = await res.json();
      setDays(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load week schedule", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWeek();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>Loading weekly schedule…</p>;

  const activeDay = days[selectedDayIdx] || days[0];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1>🗓️ {t("week")}</h1>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>7-Day Medication Plan</span>
      </div>

      {/* 7-Day Quick Selector Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 10,
          marginBottom: 20,
        }}
      >
        {days.map((day, idx) => {
          const isSelected = selectedDayIdx === idx;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDayIdx(idx)}
              style={{
                flex: "1 0 90px",
                padding: "12px 8px",
                borderRadius: 12,
                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: isSelected ? "var(--accent-light)" : "var(--card)",
                color: isSelected ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>
                {day.isToday ? `⭐ ${t("today")}` : day.dayName}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                {day.displayDate}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                {day.doses.length} dose{day.doses.length === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Doses for the Selected Day */}
      {activeDay && (
        <div>
          <h2>
            {activeDay.isToday ? `${t("today")} (${activeDay.displayDate})` : `${activeDay.dayName}, ${activeDay.displayDate}`}
          </h2>

          {activeDay.doses.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 30 }}>
              <p style={{ color: "var(--muted)" }}>No doses scheduled for this day.</p>
            </div>
          ) : (
            activeDay.doses.map((dose) => (
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
                    <div className="dose-name">{dose.medication?.name || "Medication"}</div>
                    <div className="dose-sub">
                      {dose.medication?.strength} {dose.medication?.dose ? `· ${dose.medication.dose}` : ""} ·{" "}
                      {dose.medication?.timing === "with_food"
                        ? t("withFood")
                        : dose.medication?.timing === "empty_stomach"
                        ? t("emptyStomach")
                        : t("anyTime")}
                    </div>
                  </div>
                  <div>
                    <span className={`status-pill status-${dose.status}`}>
                      {dose.isProjected ? "Upcoming" : t(dose.status) || dose.status}
                    </span>
                    {dose.medication?.criticality === "critical" && (
                      <span className="status-pill status-missed" style={{ marginLeft: 6 }}>
                        {t("critical")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
