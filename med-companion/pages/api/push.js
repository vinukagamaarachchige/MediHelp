import { secureApi, ApiError } from "../../lib/apiSecurity";
import pushConfig from "../../scripts/push-config.cjs";
import { readDB, writeDB } from "../../lib/db";
import { deviceId } from "../../lib/auth";
import { validateSubscription } from "../../lib/pushValidation";
async function handler(req, res) {
  if (req.method === "GET")
    return res.json({ publicKey: pushConfig().publicKey });
  if (req.method !== "POST") return res.status(405).end();
  const subscription = validateSubscription(req.body);
  const db = (await readDB());
  const owner = deviceId(req, db);
  const existing = (db.pushSubscriptions || []).find(
    (s) => s.endpoint === subscription.endpoint,
  );
  if (existing?.deviceId && existing.deviceId !== owner)
    throw new ApiError("Subscription belongs to another device.", 409);
  const list = (db.pushSubscriptions || []).filter(
    (s) => s.endpoint !== subscription.endpoint,
  );
  if (list.length >= 40 || list.filter((s) => s.deviceId === owner).length >= 3)
    throw new ApiError("Notification subscription limit reached.", 429);
  db.pushSubscriptions = [...list, { ...subscription, deviceId: owner }];
  await writeDB(db);
  return res.json({ ok: true });
}
export default secureApi(handler, { role: "device", key: "push", limit: 20 });
export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };
