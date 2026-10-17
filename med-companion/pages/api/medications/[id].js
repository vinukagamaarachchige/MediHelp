import { daysRemaining } from "../../../lib/supply";
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
    if (updates.pillPhoto && (!/^data:image\/(jpeg|png|webp);base64,/.test(updates.pillPhoto) || updates.pillPhoto.length > 820000)) return res.status(400).json({error: "Invalid pill photo"});
    if (updates.currentSupply !== undefined && updates.currentSupply !== null && (!Number.isFinite(updates.currentSupply) || updates.currentSupply < 0)) return res.status(400).json({error: "Supply must be a non-negative number"});
    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // cannot change ID
      updatedAt: new Date().toISOString(),
    };

    // If supply replenished (> 5), acknowledge any active refill alerts for this medication
    if (typeof updates.currentSupply === "number" && daysRemaining(updated) > 5) {
      db.alerts.forEach((a) => {
        if (a.type === "refill_low" && (a.medicationId === updated.id || (!a.medicationId && a.medicationName === updated.name)) && !a.acknowledged) {
          a.acknowledged = true;
          a.acknowledgedAt = new Date().toISOString();
        }
      });
    }

    db.medications[medIndex] = updated;

    logAgentActivity(
      db,
      "replan",
      `Medication updated: ${updated.name} (Supply: ${updated.currentSupply ?? 30} pills, Status: ${
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
