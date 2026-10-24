import { secureApi } from "../../lib/apiSecurity";
import { requireCaregiver } from "../../lib/auth";
import { readDB, writeDB, logAgentActivity } from "../../lib/db";

async function handler(req, res) {
  const db = (await readDB());
  res.setHeader("Cache-Control", "no-store");
  if (!requireCaregiver(req, res, db)) return;

  if (req.method === "GET") {
    let alerts = [...db.alerts];

    // Filter by acknowledged status if specified
    if (req.query.status === "unacknowledged") {
      alerts = alerts.filter((a) => !a.acknowledged);
    } else if (req.query.status === "acknowledged") {
      alerts = alerts.filter((a) => a.acknowledged);
    }

    // Filter by medication name if specified
    if (req.query.medication) {
      const q = req.query.medication.toLowerCase();
      alerts = alerts.filter((a) => (a.medicationName || "").toLowerCase().includes(q));
    }

    // Sort order
    const sortBy = req.query.sort || "newest";
    if (sortBy === "criticality") {
      alerts.sort((a, b) => (b.criticality === "critical" ? 1 : 0) - (a.criticality === "critical" ? 1 : 0));
    } else if (sortBy === "medication") {
      alerts.sort((a, b) => (a.medicationName || "").localeCompare(b.medicationName || ""));
    } else {
      // default: newest first
      alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    return res.status(200).json(alerts);
  }

  if (req.method === "POST") {
    const { id } = req.body || {};
    const alert = db.alerts.find((a) => a.id === id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();

    logAgentActivity(
      db,
      "action",
      `Caregiver acknowledged alert for ${alert.medicationName} (${alert.criticality})`,
      { alertId: alert.id, doseId: alert.doseId }
    );

    await writeDB(db);
    return res.status(200).json(alert);
  }

  res.status(405).json({ error: "Use GET or POST" });
}

export default secureApi(handler, { role: "device" });
export const config = {api:{bodyParser:{sizeLimit:"32kb"}}};
