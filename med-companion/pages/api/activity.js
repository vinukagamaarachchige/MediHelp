import { readDB, writeDB, logAgentActivity } from "../../lib/db";

export default function handler(req, res) {
  const db = readDB();

  if (req.method === "GET") {
    const logs = db.activityLogs || [];
    return res.status(200).json(logs);
  }

  if (req.method === "POST") {
    const { action } = req.body || {};
    if (action === "clear") {
      db.activityLogs = [];
      logAgentActivity(db, "action", "Activity log cleared by caregiver");
      writeDB(db);
      return res.status(200).json({ message: "Logs cleared" });
    }
  }

  res.status(405).json({ error: "Use GET or POST" });
}
