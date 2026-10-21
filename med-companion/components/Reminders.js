import { useEffect, useState } from "react";

export default function Reminders() {
 const [status,setStatus] = useState("");
 const [busy,setBusy] = useState(false);
 const [localEnabled,setLocalEnabled] = useState(false);
 useEffect(()=>{setLocalEnabled(localStorage.getItem("companion-local-reminders")==="true");},[]);
 async function enable(background) {
  setBusy(true);
  try {
   if (!("Notification" in window)) throw new Error("This browser does not support device notifications. Keep using your usual medication alarm.");
   if (await Notification.requestPermission() !== "granted") throw new Error("Notifications were not enabled. Review this site’s notification permission in your browser.");
   localStorage.setItem("companion-local-reminders","true"); setLocalEnabled(true); window.dispatchEvent(new Event("companion-reminders-change"));
   if (!background) {setStatus("On-device reminders enabled while Companion is open. They cannot wake a closed app."); return;}
   if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("On-device reminders enabled. Background push is unavailable in this browser; on iPhone, install to Home Screen first.");
   const response = await fetch("/api/push");
   if (!response.ok) throw new Error("On-device reminders enabled, but the background service could not be reached.");
   const {publicKey} = await response.json();
   const registration = await navigator.serviceWorker.ready;
   const base64 = publicKey.replace(/-/g,"+").replace(/_/g,"/");
   const key = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length/4)*4,"=")),c=>c.charCodeAt(0));
   const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   const saved = await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription)});
   if (!saved.ok) throw new Error("Could not save the background subscription.");
   setStatus("Background push subscribed, with on-device fallback while open. The Companion server must remain running; delivery depends on phone settings and connectivity.");
  } catch(error) { setStatus(error.message); } finally {setBusy(false);}
 }
 function disableLocal() {localStorage.removeItem("companion-local-reminders");setLocalEnabled(false);window.dispatchEvent(new Event("companion-reminders-change"));setStatus("On-device fallback disabled. You can separately disable this site’s background notification permission in browser settings.");}
 return <section className="card"><h2>🔔 Medication reminders</h2><p>Use background push for a closed app, with an on-device fallback while Companion is open. No web alarm can guarantee delivery when a phone is offline or notifications are blocked.</p><div className="banner-actions"><button className="btn btn-primary" disabled={busy} onClick={()=>enable(true)}>{busy?"Enabling…":"Enable background reminders"}</button><button className="btn btn-secondary" disabled={busy} onClick={()=>localEnabled?disableLocal():enable(false)}>{localEnabled?"Disable on-device fallback":"Enable on-device reminders"}</button></div><p role="status">{status}</p></section>;
}
