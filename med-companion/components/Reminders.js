import { useState } from "react";
export default function Reminders() {
 const [status, setStatus] = useState("");
 async function enable() {
  try {
   if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push reminders unavailable on this browser.");
   const {publicKey} = await fetch("/api/push").then(r => r.json());
   if (!publicKey) throw new Error("Server push keys are not configured. See README.");
   if (await Notification.requestPermission() !== "granted") throw new Error("Notifications were not enabled.");
   const registration = await navigator.serviceWorker.ready;
   const key = Uint8Array.from(atob(publicKey.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
   const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   const response = await fetch("/api/push", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(subscription)});
   if (!response.ok) throw new Error("Could not save subscription.");
   setStatus("Device subscribed. Delivery requires the server reminder job.");
  } catch(error) { setStatus(error.message); }
 }
 return <div className="card"><button className="btn btn-secondary" onClick={enable}>Enable device reminders</button><p role="status">{status || "Install using Add to Home Screen. Background reminders require server setup."}</p></div>;
}
