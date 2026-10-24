import { secureApi } from "../../../lib/apiSecurity";
import { readDB, writeDB, nextId, logAgentActivity } from "../../../lib/db";

// How long to wait after the scheduled time before calling a dose
// missed. Critical medications get a shorter window (FR5.3).
const WINDOW_MINUTES_NORMAL = 30;
const WINDOW_MINUTES_CRITICAL = 10;

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const db = (await readDB());
  const medById = Object.fromEntries(db.medications.map((m) => [m.id, m]));
  const now = new Date();
  const newAlerts = [];

  for (const dose of db.doses) {
    if (dose.status !== "pending") continue;

    const med = medById[dose.medicationId];
    const windowMin =
      med?.criticality === "critical" ? WINDOW_MINUTES_CRITICAL : WINDOW_MINUTES_NORMAL;

    const dueBy = new Date(new Date(dose.scheduledTime).getTime() + windowMin * 60000);
    if (now < dueBy) continue; // not late yet

    // Mark missed and escalate (FR4.3, FR5.1-5.4).
    dose.status = "missed";

    const alert = {
      id: nextId("alert"),
      doseId: dose.id,
      medicationName: med?.name || "Unknown medication",
      type: "missed_dose",
      criticality: med?.criticality || "normal",
      timestamp: now.toISOString(),
      acknowledged: false,
      log: [
        { step: "dose_scheduled", at: dose.scheduledTime },
        { step: "no_response", at: dueBy.toISOString() },
        { step: "caregiver_dashboard_alert_created", at: now.toISOString(), caregiverId: db.caregivers[0]?.id },
      ],
    };
    db.alerts.push(alert);
    newAlerts.push(alert);

    // Record escalation trail in global agent activity
    logAgentActivity(
      db,
      "escalate",
      `Dose missed: ${med?.name || "Medication"} overdue by >${windowMin}m (${
        med?.criticality === "critical" ? "CRITICAL" : "Normal"
      }). Escalated alert to ${db.caregivers[0]?.name || "Caregiver"}.`,
      {
        doseId: dose.id,
        medication: med?.name,
        criticality: med?.criticality,
        scheduledTime: dose.scheduledTime,
      }
    );
  }

  // Always record monitor check in agent activity trail
  logAgentActivity(
    db,
    "monitor",
    `Monitor scan completed: ${db.doses.filter((d) => d.status === "pending").length} pending doses checked. ${
      newAlerts.length
    } escalation(s) triggered.`,
    { checkedAt: now.toISOString(), escalatedCount: newAlerts.length }
  );

  await writeDB(db);
  res.status(200).json({ checkedAt: now.toISOString(), newAlerts });
}

export default secureApi(handler, { role: "device" });
export const config = {api:{bodyParser:{sizeLimit:"32kb"}}};
