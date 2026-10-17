import { readDB, writeDB } from "../../lib/db";
export default function handler(req, res) {
 if (req.method === "GET") return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
 if (req.method !== "POST") return res.status(405).end();
 const subscription = req.body;
 if (!subscription?.endpoint?.startsWith("https://") || !subscription.keys?.p256dh || !subscription.keys?.auth) return res.status(400).json({error:"Invalid subscription"});
 const db = readDB();
 db.pushSubscriptions = [...(db.pushSubscriptions || []).filter(s => s.endpoint !== subscription.endpoint), subscription];
 writeDB(db); res.json({ok:true});
}
