import { medicationInput, publicMedication } from "../../../lib/validation";
import { buildTodaySchedule } from "../../../lib/schedule";
import { secureApi } from "../../../lib/apiSecurity";
import { requireCaregiver } from "../../../lib/auth";
import { daysRemaining } from "../../../lib/supply";
import { readDB, writeDB, logAgentActivity } from "../../../lib/db";
import { checkMedicationInteractions } from "../../../lib/interactions";

async function handler(req, res) {
  const { id } = req.query;
  const db = (await readDB());
  if (req.method !== "GET" && !requireCaregiver(req, res, db)) return;

  const medIndex = db.medications.findIndex((m) => m.id === id);
  if (medIndex === -1) {
    return res.status(404).json({ error: "Medication not found" });
  }

  const existing = db.medications[medIndex];

  if (req.method === "GET") {
    return res.status(200).json(publicMedication(existing));
  }

  // Update medication fields
  if (req.method === "PUT" || req.method === "PATCH") {
    const updates = medicationInput(req.body, { partial: true });
    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // cannot change ID
      updatedAt: new Date().toISOString(),
    };

    // If supply replenished (> 5), acknowledge any active refill alerts for this medication
    if (
      typeof updates.currentSupply === "number" &&
      daysRemaining(updated) > 5
    ) {
      db.alerts.forEach((a) => {
        if (
          a.type === "refill_low" &&
          (a.medicationId === updated.id ||
            (!a.medicationId && a.medicationName === updated.name)) &&
          !a.acknowledged
        ) {
          a.acknowledged = true;
          a.acknowledgedAt = new Date().toISOString();
        }
      });
    }

    db.medications[medIndex] = updated;
    if (updated.retired)
      db.doses = db.doses.filter(
        (d) => !(d.medicationId === id && d.status === "pending"),
      );
    else if (existing.retired) {
      const fresh = buildTodaySchedule(db.person, [updated]).filter(
        (d) =>
          !db.doses.some(
            (saved) =>
              saved.medicationId === id &&
              saved.scheduledTime === d.scheduledTime,
          ),
      );
      db.doses.push(...fresh);
    }

    logAgentActivity(
      db,
      "replan",
      `Medication updated: ${updated.name} (Supply: ${updated.currentSupply ?? 30} pills, Status: ${
        updated.retired ? "Retired" : "Active"
      })`,
      { medicationId: id, changedFields: Object.keys(updates) },
    );

    await writeDB(db);
    return res.status(200).json({ medication: publicMedication(updated) });
  }

  // Retire / delete medication
  if (req.method === "DELETE") {
    // Mark as retired rather than hard deleting to preserve historical dose adherence records
    existing.retired = true;
    existing.retiredAt = new Date().toISOString();

    // Remove any pending doses for this retired medication so they don't escalate
    const initialPendingCount = db.doses.filter(
      (d) => d.medicationId === id && d.status === "pending",
    ).length;

    db.doses = db.doses.filter(
      (d) => !(d.medicationId === id && d.status === "pending"),
    );

    logAgentActivity(
      db,
      "replan",
      `Medication retired: ${existing.name}. Removed ${initialPendingCount} pending dose(s).`,
      { medicationId: id, retiredAt: existing.retiredAt },
    );

    await writeDB(db);
    return res.status(200).json({
      message: `Medication '${existing.name}' has been retired.`,
      medication: publicMedication(existing),
    });
  }

  res.status(405).json({ error: "Use GET, PUT, or DELETE" });
}

export default secureApi(handler, { role: "device" });
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
