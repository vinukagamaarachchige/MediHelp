import { extractMedications } from "../../lib/llmExtract";
import { readDB, writeDB, logAgentActivity } from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { text, imageBase64, imageType } = req.body || {};
  if ((!text || !text.trim()) && !imageBase64) {
    return res.status(400).json({ error: "No prescription text or image provided" });
  }

  try {
    const result = await extractMedications({ text, imageBase64, imageType });

    // Log the intake activity
    const db = readDB();
    logAgentActivity(
      db,
      "intake",
      `Prescription intake processed (${imageBase64 ? "scanned photo" : "text paste"}): ${
        result.items?.length || 0
      } medications identified`,
      {
        source: result.source,
        medicationCount: result.items?.length || 0,
        medications: (result.items || []).map((m) => m.name),
      }
    );
    writeDB(db);

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: "Extraction failed", detail: String(err) });
  }
}
