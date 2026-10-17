import { readDB, writeDB, logAgentActivity } from "../../../../lib/db";

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
  const previousStatus = dose.status;

  dose.status = status;
  dose.confirmedAt = new Date().toISOString();

  // Record action in agent activity trail
  logAgentActivity(
    db,
    "action",
    `Dose marked ${status.toUpperCase()}: ${med?.name || "Medication"} (${med?.strength || ""}) scheduled for ${new Date(
      dose.scheduledTime
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    { doseId: dose.id, medication: med?.name, status, previousStatus }
  );

  writeDB(db);
  res.status(200).json(dose);
}
