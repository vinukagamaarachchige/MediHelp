import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_app";

export default function MedicationsList() {
  const { t, showToast } = useApp();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMed, setEditingMed] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [filterRetired, setFilterRetired] = useState(false);

  async function loadMedications() {
    try {
      const res = await fetch("/api/medications");
      if (res.ok) {
        const data = await res.json();
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

  async function handleRetire(id, name) {
    if (!confirm(`Are you sure you want to retire ${name}? This will remove any future pending doses.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/medications/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(`${name} has been retired`, "warn");
        loadMedications();
      }
    } catch (e) {
      showToast("Failed to retire medication", "warn");
    }
  }

  async function handleReactivate(id, name) {
    try {
      const res = await fetch(`/api/medications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retired: false }),
      });
      if (res.ok) {
        showToast(`${name} reactivated`, "success");
        loadMedications();
      }
    } catch (e) {
      showToast("Failed to reactivate", "warn");
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/medications/${editingMed.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingMed),
      });
      if (res.ok) {
        showToast("Medication details updated", "success");
        setEditingMed(null);
        loadMedications();
      } else {
        showToast("Error updating medication", "warn");
      }
    } catch (e) {
      showToast("Error updating medication", "warn");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading medications…</p>;

  const activeMeds = medications.filter((m) => !m.retired);
  const retiredMeds = medications.filter((m) => m.retired);
  const displayedMeds = filterRetired ? retiredMeds : activeMeds;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1>💊 {t("medications")}</h1>
        <Link href="/prescription/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
          + Add New
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          className={`btn ${!filterRetired ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setFilterRetired(false)}
        >
          {t("activeMeds")} ({activeMeds.length})
        </button>
        <button
          className={`btn ${filterRetired ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setFilterRetired(true)}
        >
          {t("retiredMeds")} ({retiredMeds.length})
        </button>
      </div>

      {displayedMeds.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <p style={{ color: "var(--muted)" }}>
            {filterRetired
              ? "No retired medications."
              : "No active medications. Add a prescription to get started."}
          </p>
        </div>
      )}

      {displayedMeds.map((med) => (
        <div
          className="card"
          key={med.id}
          style={{
            opacity: med.retired ? 0.75 : 1,
            borderLeft: med.retired ? "6px solid var(--muted)" : "6px solid var(--accent)",
          }}
        >
          <div className="dose-row">
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {med.name}
                {med.strength && (
                  <span style={{ fontSize: 16, fontWeight: 500, color: "var(--muted)", marginLeft: 8 }}>
                    ({med.strength})
                  </span>
                )}
              </div>
              <div className="dose-sub" style={{ marginTop: 4 }}>
                <strong>Dose:</strong> {med.dose || "1 unit"} · <strong>Frequency:</strong> {med.frequency} ·{" "}
                <strong>Timing:</strong>{" "}
                {med.timing === "with_food"
                  ? t("withFood")
                  : med.timing === "empty_stomach"
                  ? t("emptyStomach")
                  : t("anyTime")}
              </div>
              <div className="dose-sub">
                {med.doctor && <span>Doctor: {med.doctor} · </span>}
                {med.duration && <span>Duration: {med.duration} · </span>}
                <span className={`status-pill ${med.criticality === "critical" ? "status-missed" : "status-pending"}`}>
                  {med.criticality === "critical" ? "CRITICAL (10m grace)" : "Normal"}
                </span>
                {med.retired && (
                  <span className="status-pill status-skipped" style={{ marginLeft: 8 }}>
                    Retired
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {!med.retired ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditingMed({ ...med })}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="btn btn-skip"
                    onClick={() => handleRetire(med.id, med.name)}
                  >
                    {t("retire")}
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-taken"
                  onClick={() => handleReactivate(med.id, med.name)}
                >
                  ↩️ Reactivate
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Edit Medication Modal */}
      {editingMed && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: "left", maxWidth: 540 }}>
            <h2>✏️ Edit Medication</h2>
            <form onSubmit={handleSaveEdit}>
              <label>Medication Name</label>
              <input
                value={editingMed.name}
                onChange={(e) => setEditingMed({ ...editingMed, name: e.target.value })}
                required
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label>Strength</label>
                  <input
                    value={editingMed.strength}
                    onChange={(e) => setEditingMed({ ...editingMed, strength: e.target.value })}
                  />
                </div>
                <div>
                  <label>Dose</label>
                  <input
                    value={editingMed.dose}
                    onChange={(e) => setEditingMed({ ...editingMed, dose: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label>Frequency</label>
                  <select
                    value={editingMed.frequency}
                    onChange={(e) => setEditingMed({ ...editingMed, frequency: e.target.value })}
                  >
                    <option value="once daily">Once daily</option>
                    <option value="twice daily">Twice daily</option>
                    <option value="three times a day">Three times a day</option>
                    <option value="four times a day">Four times a day</option>
                  </select>
                </div>
                <div>
                  <label>Timing</label>
                  <select
                    value={editingMed.timing}
                    onChange={(e) => setEditingMed({ ...editingMed, timing: e.target.value })}
                  >
                    <option value="any">Any time</option>
                    <option value="with_food">With food</option>
                    <option value="empty_stomach">Empty stomach</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label>Duration</label>
                  <input
                    value={editingMed.duration}
                    onChange={(e) => setEditingMed({ ...editingMed, duration: e.target.value })}
                  />
                </div>
                <div>
                  <label>Criticality</label>
                  <select
                    value={editingMed.criticality}
                    onChange={(e) => setEditingMed({ ...editingMed, criticality: e.target.value })}
                  >
                    <option value="normal">Normal (30 min grace)</option>
                    <option value="critical">Critical (10 min grace)</option>
                  </select>
                </div>
              </div>

              <label>Prescribing Doctor</label>
              <input
                value={editingMed.doctor}
                onChange={(e) => setEditingMed({ ...editingMed, doctor: e.target.value })}
              />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingMed(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
