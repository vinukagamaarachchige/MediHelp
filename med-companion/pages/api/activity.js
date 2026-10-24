import { secureApi } from "../../lib/apiSecurity";
import { requireCaregiver } from "../../lib/auth";
import { readDB, writeDB, logAgentActivity } from "../../lib/db";

async function handler(req, res) {
  const db = (await readDB());
  res.setHeader("Cache-Control", "no-store");
  if (!requireCaregiver(req, res, db)) return;

  if (req.method === "GET") {
    const logs = db.activityLogs || [];
    return res.status(200).json(logs);
  }

  if (req.method === "POST") {
    const { action } = req.body || {};
    if (action === "clear") {
      db.activityLogs = [];
      logAgentActivity(db, "action", "Activity log cleared by caregiver");
      await writeDB(db);
      return res.status(200).json({ message: "Logs cleared" });
    }
  }

  res.status(405).json({ error: "Use GET or POST" });
}

export default secureApi(handler, { role: "device" });
export const config = {api:{bodyParser:{sizeLimit:"32kb"}}};
