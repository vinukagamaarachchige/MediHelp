import { secureApi, ApiError } from "../../lib/apiSecurity";
import { photoData } from "../../lib/validation";
import { extractMedications } from "../../lib/llmExtract";
import { readDB, writeDB, logAgentActivity } from "../../lib/db";
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  let { text, imageBase64, imageType } = req.body || {};
  if (text !== undefined && (typeof text !== "string" || text.length > 20000))
    throw new ApiError("Prescription text must be at most 20000 characters.");
  if (imageBase64) {
    photoData(imageBase64, 2000000);
    imageType = imageBase64.match(/^data:(image\/(?:jpeg|png|webp));/)[1];
  }
  if (!text?.trim() && !imageBase64)
    throw new ApiError("Provide prescription text or a raster image.");
  const result = await extractMedications({
    text: text?.trim(),
    imageBase64,
    imageType,
  });
  const db = (await readDB());
  logAgentActivity(
    db,
    "intake",
    "Prescription extraction completed; original must be verified",
    { source: result.source, medicationCount: result.items.length },
  );
  await writeDB(db);
  return res.json(result);
}
export default secureApi(handler, {
  role: "caregiver",
  key: "extraction",
  limit: 5,
  windowMs: 300000,
});
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
