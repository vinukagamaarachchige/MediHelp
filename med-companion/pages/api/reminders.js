import { constantEqual, activeDeviceIds } from "../../lib/auth";
import { validateSubscription } from "../../lib/pushValidation";
import { secureApi } from "../../lib/apiSecurity";
import pushConfig from "../../scripts/push-config.cjs";
import webpush from "web-push";
import { readDB, writeDB } from "../../lib/db";
import { buildTodaySchedule } from "../../lib/schedule";

// Production startup invokes this every 30 seconds; an authenticated external scheduler can also use it.
const jobState = (globalThis.__companionReminderJob ||= { running: false });
async function runReminderJob(config, res) {
  const deadline = Date.now() + 20000;
  const db = (await readDB());
  const now = new Date();
  const activeDevices = activeDeviceIds(db);
  db.pushSubscriptions = (db.pushSubscriptions || []).filter((s) =>
    activeDevices.has(s.deviceId),
  );
  const sameDay = (iso) => new Date(iso).toDateString() === now.toDateString();
  const missing = db.medications.filter(
    (m) =>
      !m.retired &&
      !db.doses.some(
        (d) => d.medicationId === m.id && sameDay(d.scheduledTime),
      ),
  );
  db.doses.push(...buildTodaySchedule(db.person, missing));
  await writeDB(db);
  const pushEnabled = config.publicKey && config.privateKey;
  if (pushEnabled)
    webpush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
  const outcomes = [];
  const expiredEndpoints = new Set();
  for (const dose of db.doses.filter(
    (d) =>
      d.status === "pending" &&
      sameDay(d.scheduledTime) &&
      new Date(d.scheduledTime) <= now &&
      now - new Date(d.scheduledTime) < 3600000,
  )) {
    if (Date.now() >= deadline) break;
    const med = db.medications.find(
      (m) => m.id === dose.medicationId && !m.retired,
    );
    if (!med) continue;
    dose.reminderDeliveries ||= {};
    const body = `${med.name}: ${med.dose}. Open your schedule to check this dose.`;
    if (pushEnabled)
      for (const subscription of [...(db.pushSubscriptions || [])]) {
        if (Date.now() >= deadline) break;
        const current = (await readDB());
        if (!activeDeviceIds(current).has(subscription.deviceId)) {
          expiredEndpoints.add(subscription.endpoint);
          continue;
        }
        if (current.doses.find((d) => d.id === dose.id)?.status !== "pending")
          break;
        if (dose.reminderDeliveries[subscription.endpoint]) continue;
        try {
          const safeSubscription = validateSubscription(subscription);
          await webpush.sendNotification(
            safeSubscription,
            JSON.stringify({
              title: "Medication reminder",
              body: "Open Companion to check your schedule.",
              tag: dose.id,
            }),
            { timeout: 5000 },
          );
          dose.reminderDeliveries[subscription.endpoint] = now.toISOString();
          outcomes.push({ doseId: dose.id, channel: "push", status: "sent" });
        } catch (error) {
          if (error.status === 400 || [404, 410].includes(error.statusCode))
            expiredEndpoints.add(subscription.endpoint);
          outcomes.push({ doseId: dose.id, channel: "push", status: "failed" });
        }
      }
    if (
      (await readDB()).doses.find((d) => d.id === dose.id)?.status === "pending" &&
      !dose.reminderDeliveries.whatsapp &&
      process.env.WHATSAPP_TOKEN &&
      process.env.WHATSAPP_PHONE_ID &&
      process.env.WHATSAPP_TO &&
      process.env.WHATSAPP_TEMPLATE &&
      process.env.WHATSAPP_API_VERSION
    ) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`,
          {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: process.env.WHATSAPP_TO,
              type: "template",
              template: {
                name: process.env.WHATSAPP_TEMPLATE,
                language: { code: process.env.WHATSAPP_LANGUAGE || "en_US" },
                components: [
                  { type: "body", parameters: [{ type: "text", text: body }] },
                ],
              },
            }),
          },
        );
        if (!response.ok) throw new Error("Provider rejected reminder");
        dose.reminderDeliveries.whatsapp = now.toISOString();
        outcomes.push({ doseId: dose.id, channel: "whatsapp", status: "sent" });
      } catch {
        outcomes.push({
          doseId: dose.id,
          channel: "whatsapp",
          status: "failed",
        });
      }
    }
  }
  // Do not overwrite dose confirmations or stock changes made during network requests.
  const latest = (await readDB());
  for (const dose of db.doses) {
    const saved = latest.doses.find((d) => d.id === dose.id);
    if (saved)
      saved.reminderDeliveries = {
        ...saved.reminderDeliveries,
        ...dose.reminderDeliveries,
      };
  }
  latest.pushSubscriptions = (latest.pushSubscriptions || []).filter(
    (s) => !expiredEndpoints.has(s.endpoint),
  );
  await writeDB(latest);
  return res.json({ outcomes });
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const config = pushConfig();
  if (!constantEqual(req.headers.authorization, `Bearer ${config.secret}`))
    return res.status(401).end();
  if (jobState.running)
    return res
      .status(409)
      .json({ error: "A reminder job is already running." });
  jobState.running = true;
  try {
    return await runReminderJob(config, res);
  } finally {
    jobState.running = false;
  }
}
export default secureApi(handler, { role: "scheduler" });
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
