import { readDB, writeDB, logAgentActivity } from "../../../lib/db";
import { checkMedicationInteractions } from "../../../lib/interactions";

export default function handler(req, res) {
  const { id } = req.query;
  const db = readDB();

  const medIndex = db.medications.findIndex((m) => m.id === id);
  if (medIndex === -1) {
    return res.status(404).json({ error: "Medication not found" });
  }

  const existing = db.medications[medIndex];

  if (req.method === "GET") {
    return res.status(200).json(existing);
  }

  // Update medication fields
  if (req.method === "PUT" || req.method === "PATCH") {
    const updates = req.body || {};
    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // cannot change ID
      updatedAt: new Date().toISOString(),
    };

    db.medications[medIndex] = updated;

    logAgentActivity(
      db,
      "replan",
      `Medication updated: ${updated.name} (Frequency: ${updated.frequency}, Status: ${
        updated.retired ? "Retired" : "Active"
      })`,
      { medicationId: id, updates }
    );

    writeDB(db);
    return res.status(200).json({ medication: updated });
  }

  // Retire / delete medication
  if (req.method === "DELETE") {
    // Mark as retired rather than hard deleting to preserve historical dose adherence records
    existing.retired = true;
    existing.retiredAt = new Date().toISOString();

    // Remove any pending doses for this retired medication so they don't escalate
    const initialPendingCount = db.doses.filter(
      (d) => d.medicationId === id && d.status === "pending"
    ).length;

    db.doses = db.doses.filter(
      (d) => !(d.medicationId === id && d.status === "pending")
    );

    logAgentActivity(
      db,
      "replan",
      `Medication retired: ${existing.name}. Removed ${initialPendingCount} pending dose(s).`,
      { medicationId: id, retiredAt: existing.retiredAt }
    );

    writeDB(db);
    return res.status(200).json({
      message: `Medication '${existing.name}' has been retired.`,
      medication: existing,
    });
  }

  res.status(405).json({ error: "Use GET, PUT, or DELETE" });
}
