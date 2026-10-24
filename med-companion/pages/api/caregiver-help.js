import { secureApi } from "../../lib/apiSecurity";
import { readDB, writeDB, nextId, logAgentActivity } from "../../lib/db";
import { isOverdue } from "../../lib/doseState";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const db = (await readDB());
  const overdue = db.doses.filter(d => new Date(d.scheduledTime).toDateString() === new Date().toDateString() && isOverdue({...d,medication:db.medications.find(m=>m.id===d.medicationId)}));
  if (!overdue.length) return res.status(409).json({error:"No overdue doses need attention."});
  const doseIds = overdue.map(d => d.id);
  const existing = db.alerts.find(a => a.type === "caregiver_help" && !a.acknowledged && doseIds.every(id => a.doseIds?.includes(id)));
  if (existing) return res.json({message:"Your caregiver dashboard already has this request.",alertId:existing.id});
  const alert = {id:nextId("alert"),type:"caregiver_help",doseIds,medicationName:overdue.map(d=>db.medications.find(m=>m.id===d.medicationId)?.name || "Medication").join(", "),criticality:overdue.some(d=>db.medications.find(m=>m.id===d.medicationId)?.criticality==="critical")?"critical":"normal",timestamp:new Date().toISOString(),acknowledged:false,message:"The elder requested help with overdue medication.",log:[{step:"elder_requested_caregiver_help",at:new Date().toISOString()}]};
  db.alerts.unshift(alert);
  logAgentActivity(db,"escalate",alert.message,{alertId:alert.id,doseIds});
  await writeDB(db);
  // Optional external channel; the in-app alert is durable before any network work.
  let external = "not_configured";
  if (process.env.CAREGIVER_WHATSAPP_TO && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.CAREGIVER_WHATSAPP_TEMPLATE && process.env.WHATSAPP_API_VERSION) {
    try {
      const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`,{method:"POST",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:process.env.CAREGIVER_WHATSAPP_TO,type:"template",template:{name:process.env.CAREGIVER_WHATSAPP_TEMPLATE,language:{code:process.env.WHATSAPP_LANGUAGE || "en_US"},components:[{type:"body",parameters:[{type:"text",text:`${db.person.name} requests help with overdue medication. Open Companion to review.`}]}]}})});
      external=response.ok?"accepted":"failed";
    } catch { external="failed"; }
  }
  return res.json({alertId:alert.id,external,message:external==="accepted"?"Caregiver dashboard updated; WhatsApp accepted the message.":external==="failed"?"Caregiver dashboard updated. External delivery failed; contact your caregiver directly.":"Help request added to the caregiver dashboard. External messaging is not configured; contact your caregiver directly if needed."});
}

export default secureApi(handler, { role: "device", key: "caregiver-help", limit: 5, windowMs: 60000 });
export const config = {api:{bodyParser:{sizeLimit:"32kb"}}};
