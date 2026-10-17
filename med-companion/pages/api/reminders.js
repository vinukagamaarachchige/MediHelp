import webpush from "web-push";
import { readDB, writeDB } from "../../lib/db";
import { buildTodaySchedule } from "../../lib/schedule";

// Invoke once per minute using an authenticated external scheduler.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.REMINDER_SECRET || req.headers.authorization !== `Bearer ${process.env.REMINDER_SECRET}`) return res.status(401).end();
  const db = readDB();
  const now = new Date();
  const sameDay = iso => new Date(iso).toDateString() === now.toDateString();
  const missing = db.medications.filter(m => !m.retired && !db.doses.some(d => d.medicationId === m.id && sameDay(d.scheduledTime)));
  db.doses.push(...buildTodaySchedule(db.person, missing));
  const pushEnabled = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT;
  if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const outcomes = [];
  for (const dose of db.doses.filter(d => d.status === "pending" && sameDay(d.scheduledTime) && new Date(d.scheduledTime) <= now && now - new Date(d.scheduledTime) < 3600000)) {
    const med = db.medications.find(m => m.id === dose.medicationId && !m.retired);
    if (!med) continue;
    dose.reminderDeliveries ||= {};
    const body = `${med.name}: ${med.dose}. Open your schedule to check this dose.`;
    if (pushEnabled) for (const subscription of [...(db.pushSubscriptions || [])]) {
      if (dose.reminderDeliveries[subscription.endpoint]) continue;
      try {
        await webpush.sendNotification(subscription, JSON.stringify({title:"Medication reminder",body,tag:dose.id}));
        dose.reminderDeliveries[subscription.endpoint] = now.toISOString();
        outcomes.push({doseId:dose.id,channel:"push",status:"sent"});
      } catch (error) {
        if ([404,410].includes(error.statusCode)) db.pushSubscriptions = db.pushSubscriptions.filter(s => s.endpoint !== subscription.endpoint);
        outcomes.push({doseId:dose.id,channel:"push",status:"failed"});
      }
    }
    if (!dose.reminderDeliveries.whatsapp && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TO && process.env.WHATSAPP_TEMPLATE && process.env.WHATSAPP_API_VERSION) {
      try {
        const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
          method:"POST", headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},
          body:JSON.stringify({messaging_product:"whatsapp",to:process.env.WHATSAPP_TO,type:"template",template:{name:process.env.WHATSAPP_TEMPLATE,language:{code:process.env.WHATSAPP_LANGUAGE || "en_US"},components:[{type:"body",parameters:[{type:"text",text:body}]}]}})
        });
        if (!response.ok) throw new Error("Provider rejected reminder");
        dose.reminderDeliveries.whatsapp = now.toISOString();
        outcomes.push({doseId:dose.id,channel:"whatsapp",status:"sent"});
      } catch { outcomes.push({doseId:dose.id,channel:"whatsapp",status:"failed"}); }
    }
  }
  writeDB(db);
  return res.json({outcomes});
}
