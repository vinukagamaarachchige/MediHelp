import { unitsPerDose, daysRemaining } from "../../../../lib/supply";
import { readDB, writeDB, nextId, logAgentActivity } from "../../../../lib/db";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { id } = req.query;
  const { status } = req.body || {}; // "taken" | "skipped"

  if (!["taken", "skipped"].includes(status)) {
    return res.status(400).json({ error: "status must be 'taken' or 'skipped'" });
  }

  const db = readDB();
  const dose = db.doses.find((d) => d.id === id);
  if (!dose) return res.status(404).json({ error: "Dose not found" });

  const med = db.medications.find((m) => m.id === dose.medicationId);
  if (dose.status === "taken") return res.status(status === "taken" ? 200 : 409).json({ dose, medication: med, alreadyTaken: true, error: status === "taken" ? undefined : "A taken dose is locked." });
  if (med?.retired) return res.status(409).json({ error: "Medication is retired" });
  const previousStatus = dose.status;
  const now = new Date();

  dose.status = status;
  dose.confirmedAt = now.toISOString();

  // Supply tracking: decrement remaining pill count if marked taken
  if (status === "taken" && med) {
    if (Number.isFinite(med.currentSupply) && unitsPerDose(med)) {
      med.currentSupply = Math.max(0, med.currentSupply - unitsPerDose(med));
    }

    // If supply reaches 5 or fewer pills, dispatch refill alert
    if (daysRemaining(med) !== null && daysRemaining(med) <= 5) {
      const existingRefillAlert = db.alerts.find(
        (a) =>
          a.type === "refill_low" &&
          a.medicationId === med.id &&
          !a.acknowledged
      );

      if (!existingRefillAlert) {
        const refillAlert = {
          id: nextId("alert"),
          doseId: dose.id,
          medicationName: med.name,
          medicationId: med.id,
          daysRemaining: daysRemaining(med),
          message: `${med.name} running low for ${db.person.name} (${Math.floor(daysRemaining(med))} days remaining). Request a refill${med.doctor ? ` from ${med.doctor}` : ""}.`,
          type: "refill_low",
          criticality: med.criticality || "normal",
          timestamp: now.toISOString(),
          acknowledged: false,
          pillsRemaining: med.currentSupply,
          log: [
            { step: "dose_taken", at: now.toISOString() },
            { step: "supply_threshold_reached", at: now.toISOString(), pillsRemaining: med.currentSupply },
            { step: "caregiver_refill_alert_created", at: now.toISOString() },
          ],
        };
        db.alerts.unshift(refillAlert);

        logAgentActivity(
          db,
          "escalate",
          `Refill Alert: ${med.name} running low (${med.currentSupply} pills remaining). Caregiver dashboard alert created.`,
          { medication: med.name, pillsRemaining: med.currentSupply }
        );
      }
    }
  }

  // Record action in agent activity trail
  logAgentActivity(
    db,
    "action",
    `Dose marked ${status.toUpperCase()}: ${med?.name || "Medication"} (${med?.strength || ""}) scheduled for ${new Date(
      dose.scheduledTime
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    {
      doseId: dose.id,
      medication: med?.name,
      status,
      previousStatus,
      pillsRemaining: med?.currentSupply,
    }
  );

  writeDB(db);
  res.status(200).json({ dose, medication: med });
}
