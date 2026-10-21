import MedicationInfo from "../components/MedicationInfo";
import { isOverdue } from "../lib/doseState";
import Icon from "../components/Icon";
import Reminders from "../components/Reminders";
import { daysRemaining } from "../lib/supply";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { DISCLAIMER } from "../lib/safety";
import { useApp } from "./_app";
import { playChime } from "../lib/audio";
import { getPillColorHex, getRoutineBucket, getBucketMeta, routineLabel } from "../lib/pills";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const { t, lang, showToast, requestUnlock } = useApp();
  const [doses, setDoses] = useState([]);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [detailDose, setDetailDose] = useState(null);
  const [offlineSnapshot, setOfflineSnapshot] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const actionRef = useRef(false);
  const dayRef = useRef(new Date().toDateString());
  const [viewMode, setViewMode] = useState("buckets"); // "buckets" | "timeline"
  const [actionDoseId, setActionDoseId] = useState(null);
  // Double-Dose Protection Modal State
  const [doubleDoseModal, setDoubleDoseModal] = useState(null);

  async function loadData() {
    try {
      const [schedRes, medsRes] = await Promise.all([
        fetch("/api/schedule"),
        fetch("/api/medications"),
      ]);
      if (!schedRes.ok || !medsRes.ok) throw new Error("Could not load a recent schedule. Please reconnect and retry.");
      const fromCache = schedRes.headers.get("X-Companion-Offline") === "true";
      setOfflineSnapshot(fromCache || !navigator.onLine);
      setSavedAt(schedRes.headers.get("X-Companion-Saved-At"));
      setLoadError("");
      const schedData = await schedRes.json();
      if (fromCache && new Date(schedRes.headers.get("X-Companion-Saved-At")).toDateString() !== new Date().toDateString()) { setDoses([]); throw new Error("The saved schedule is from an earlier day. Reconnect to get today’s schedule."); }
      const medsData = await medsRes.json();

      setDoses(Array.isArray(schedData) ? schedData : []);
      setMedications(medsData.medications || []);
    } catch (err) {
      setLoadError(err.message); setOfflineSnapshot(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const offline = () => setOfflineSnapshot(true);
    window.addEventListener("online", loadData); window.addEventListener("offline", offline);
    const timer = setInterval(() => { setClock(Date.now()); if (dayRef.current !== new Date().toDateString()) { dayRef.current = new Date().toDateString(); setDoses([]); loadData(); } }, 30000);
    return () => { clearInterval(timer); window.removeEventListener("online", loadData); window.removeEventListener("offline", offline); };
  }, []);

  async function setStatus(doseId, status) {
    if (actionRef.current || offlineSnapshot || !navigator.onLine) return showToast("Reconnect before confirming a dose.", "warn");
    actionRef.current = true;
    setActionDoseId(doseId);
    try {
      const res = await fetch(`/api/doses/${doseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const error = await res.json(); throw new Error(error.error); }
      if (res.ok) {
        const result = await res.json();
        setDoses(prev => prev.map(d => d.id === doseId ? {...d,...result.dose,medication: result.medication || d.medication} : d));
        if (result.medication) setMedications(prev => prev.map(m => m.id === result.medication.id ? result.medication : m));
        if (status === "taken") {
          playChime("success");
          showToast(t("doseTakenToast"), "success");
        } else {
          showToast(t("doseSkippedToast"), "warn");
        }
      }
    } catch (err) {
      showToast("Error updating status", "warn");
    } finally {
      actionRef.current = false;
      setActionDoseId(null);
      loadData();
    }
  }

  // Handle double-dose tap on an already-taken dose
  function handleTakenDoseClick(dose) {
    const med = dose.medication || {};
    const takenAt = dose.confirmedAt ? formatTime(dose.confirmedAt) : "earlier today";

    // Find next pending dose for this medication today
    const nextPending = doses.find(
      (d) => d.medicationId === dose.medicationId && d.status === "pending" && new Date(d.scheduledTime) > new Date(dose.scheduledTime)
    );
    const nextTime = nextPending ? formatTime(nextPending.scheduledTime) : "tomorrow";

    playChime("warning");

    setDoubleDoseModal({
      medicationName: med.name || "Medication",
      takenAt,
      nextTime,
      dose,
    });
  }

  // Advance time button to demo missed-dose escalation
  async function checkMissed() {
    setChecking(true);
    try {
      const res = await fetch("/api/doses/check-missed", { method: "POST" });
      if (!res.ok) throw new Error("Check failed");
      const { newAlerts } = await res.json();
      loadData();
      if (newAlerts && newAlerts.length > 0) {
        showToast(
          `${newAlerts.length} dose(s) became missed and escalated to caregiver.`,
          "warn"
        );
      } else {
        showToast("No new missed doses. All on track!", "success");
      }
    } catch (e) {
      showToast("Check failed", "warn");
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading schedule…</p>;

  // Check for medications running low on supply (<= 5 remaining)
  const lowSupplyMeds = medications.filter(
    (m) => !m.retired && daysRemaining(m) !== null && daysRemaining(m) <= 5
  );

  const overdueDoses = doses.filter(d => isOverdue(d, clock));
  async function alertCaregiver() {
    setHelpBusy(true);
    try { const response = await fetch("/api/caregiver-help", {method:"POST"}); const data = await response.json(); if (!response.ok) throw new Error(data.error); showToast(data.message, "success"); } catch(error) { showToast(error.message, "warn"); } finally { setHelpBusy(false); }
  }

  // Group doses into routine buckets (morning, afternoon, evening, night)
  const buckets = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  doses.forEach((dose) => {
    const bKey = getRoutineBucket(dose.scheduledTime);
    if (buckets[bKey]) {
      buckets[bKey].push(dose);
    } else {
      buckets.morning.push(dose);
    }
  });

  const takenCount = doses.filter(d => d.status === "taken").length;
  const pendingCount = doses.filter(d => d.status === "pending").length;
  const nextDose = doses.find(d => d.status === "pending");
  const dateLabel = new Date().toLocaleDateString(lang === "si" ? "si-LK" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  function renderDoseCard(dose) {
    const med = dose.medication || {};
    const taken = dose.status === "taken";
    const color = getPillColorHex(med.pillColor);
    const next = doses.find(d => d.medicationId === dose.medicationId && d.status === "pending" && new Date(d.scheduledTime) > new Date(dose.scheduledTime));
    return <article className={`card medication-card ${taken ? "dose-locked-card dose-completed" : ""} dose-${dose.status}`} key={dose.id}>
      <div className="medication-card-top">
        <span className="routine-label">{routineLabel(dose, med, lang)}</span>
        <span className="scheduled-time">{formatTime(dose.scheduledTime)}</span>
      </div>
      <div className="medication-identity" onClick={event => { if (!event.target.closest("button")) setDetailDose(dose); }}>
        <div className="pill-portrait">
          {med.pillPhoto ? <img src={med.pillPhoto} alt="Actual pill or blister pack" /> : <span className={`pill-shape-icon pill-shape-${med.pillShape || "round"}`} style={{ backgroundColor: color.hex, border: `2px solid ${color.border}` }} />}
        </div>
        <div className="medication-copy">
          <h3 className="dose-name"><button className="medication-details-trigger" onClick={() => setDetailDose(dose)} aria-label={`View details for ${med.name}`}>{med.name || "Medication"}<span className="details-hint">ⓘ</span></button></h3>
          <p className="dose-sub">{med.dose || "1 dose"}{med.strength && ` · ${med.strength}`}</p>
          <p className="appearance-label">{med.pillColor || "white"} {med.pillShape || "tablet"}{med.pillImprint && ` · ${med.pillImprint}`}</p>
        </div>
        {taken && <span className="taken-symbol"><Icon name="check" size={26}/></span>}
      </div>
      {taken ? <div className="taken-receipt">
        <div><strong><Icon name="lock" size={17}/> {t("taken")} · {formatTime(dose.confirmedAt || dose.scheduledTime)}</strong><p>{lang === "si" ? "මෙම මාත්‍රාව නැවත ගන්න එපා." : "This dose is complete. Do not take it again."}{next && <> {lang === "si" ? "ඊළඟ මාත්‍රාව:" : "Next dose:"} {formatTime(next.scheduledTime)}.</>}</p></div>
        <button className="btn btn-secondary dose-status-button" onClick={() => handleTakenDoseClick(dose)}><Icon name="lock"/><span>{lang === "si" ? "තත්ත්වය බලන්න" : "Check status"}</span></button>
      </div> : dose.status === "pending" ? <div className="dose-actions">
        <button className="btn btn-taken" disabled={!!actionDoseId || offlineSnapshot} aria-busy={actionDoseId === dose.id} onClick={() => setStatus(dose.id, "taken")}><Icon name="check"/>{actionDoseId === dose.id ? "Saving…" : t("taken")}</button>
        <button className="btn skip-dose" disabled={!!actionDoseId || offlineSnapshot} onClick={() => setStatus(dose.id, "skipped")}><span className="recognition-emoji" aria-hidden="true">⏭️</span>{t("skip")}</button>
      </div> : <div className="dose-state-line"><span className={`status-pill status-${dose.status}`}>{t(dose.status)}</span></div>}
      {med.criticality === "critical" && <p className="critical-note"><span className="warning-triangle" aria-hidden="true">⚠️</span><strong>{t("critical")}</strong></p>}
    </article>;
  }
  return <div className="today-page">
    <div className="page-heading">
      <div><p className="eyebrow">{dateLabel}</p><h1>{lang === "si" ? "අද ඔබේ ඖෂධ" : "Your medicines today"}</h1><p className="page-intro">{lang === "si" ? "එක් වරකට එක් පියවරක්. ඔබේ දෛනික රටාව මෙතැනින්." : "One step at a time. Your daily routine, right here."}</p></div>
      <button className="btn btn-secondary type-toggle" onClick={() => requestUnlock("/settings")}><span className="recognition-emoji" aria-hidden="true">👓</span>{lang === "si" ? "අකුරු ප්‍රමාණය" : "Text size settings"}</button>
    </div>
    {loadError && <aside className="overdue-banner" role="alert"><p>{loadError}</p><button className="btn btn-secondary" onClick={loadData}>Try again</button></aside>}
    {offlineSnapshot && doses.length > 0 && <aside className="offline-snapshot" role="status">📴 Saved schedule — read-only{savedAt && ` · Last refreshed ${new Date(savedAt).toLocaleString()}`}. Reconnect before confirming any dose.</aside>}
    {overdueDoses.length > 0 && <aside className="overdue-banner"><h2>⚠️ {overdueDoses.length} overdue dose{overdueDoses.length === 1 ? "" : "s"} need attention</h2><p>{overdueDoses.map(d => d.medication?.name).join(", ")}. Check the recorded missed-dose instructions or ask your pharmacist.</p><div className="banner-actions"><button className="btn btn-secondary" disabled={checking || offlineSnapshot} onClick={checkMissed}>{checking ? "Checking…" : "Review missed doses"}</button><button className="btn btn-primary" disabled={helpBusy || offlineSnapshot} onClick={alertCaregiver}>{helpBusy ? "Sending…" : "🤝 Ask caregiver for help"}</button></div></aside>}
    {doses.length > 0 && <section className="daily-overview" aria-label="Daily progress">
      <div className="overview-main"><span className="eyebrow">{lang === "si" ? "අද ප්‍රගතිය" : "TODAY’S PROGRESS"}</span><p><strong>{takenCount}</strong><span> / {doses.length} {lang === "si" ? "මාත්‍රා සම්පූර්ණයි" : "doses taken"}</span></p><div className="progress-track" role="progressbar" aria-valuenow={takenCount} aria-valuemin={0} aria-valuemax={doses.length} aria-label="Doses taken"><span style={{width: `${takenCount / doses.length * 100}%`}} /></div></div>
      <div className="overview-next"><span className="overview-icon"><Icon name={pendingCount ? "pill" : "check"} size={26}/></span><div><span className="eyebrow">{pendingCount ? (lang === "si" ? "ඊළඟට" : "NEXT ON YOUR SCHEDULE") : (lang === "si" ? "අද රටාව" : "TODAY’S ROUTINE")}</span><p>{nextDose ? nextDose.medication?.name : (lang === "si" ? "තවත් මාත්‍රා නැත" : "No pending doses")}</p>{nextDose && <span className="overview-detail">{routineLabel(nextDose, nextDose.medication || {}, lang)} · {formatTime(nextDose.scheduledTime)}</span>}</div></div>
    </section>}
    {lowSupplyMeds.length > 0 && <aside className="supply-notice"><div><strong><span aria-hidden="true">⚠️ </span>{t("lowSupplyWarning")}</strong><p>{lowSupplyMeds.map(m => m.name).join(", ")} · {lang === "si" ? "නැවත ඖෂධ ලබාගැනීමට සැලසුම් කරන්න" : "Plan a refill soon"}</p></div><Link href="/pillbox" className="text-link">{lang === "si" ? "පෙති පෙට්ටිය" : "Review supply"}<Icon name="arrow" size={18}/></Link></aside>}
    {doses.length === 0 ? <section className="card empty-schedule"><span className="empty-icon"><Icon name="pill" size={36}/></span><h2>{t("noDosesToday")}</h2><p>{lang === "si" ? "ඔබේ දිනපතා රටාව බැලීමට ඖෂධ එකතු කරන්න." : "Add your medicines to see a clear daily routine."}</p><Link className="btn btn-primary" href="/prescription/new">{t("addPrescription")}<Icon name="arrow" size={18}/></Link></section> : <>
      <div className="schedule-toolbar"><h2>{lang === "si" ? "ඔබේ දෛනික රටාව" : "Your daily routine"}</h2><button className="view-toggle" onClick={() => setViewMode(viewMode === "buckets" ? "timeline" : "buckets")}>{viewMode === "buckets" ? t("timelineView") : t("bucketView")}</button></div>
      {viewMode === "buckets" ? ["morning", "afternoon", "evening", "night"].map(key => buckets[key].length > 0 && <section className="routine-bucket-group" key={key}><div className={`bucket-banner bucket-banner-${key}`}><span className="bucket-title">{t(getBucketMeta(key).titleKey)}</span><span className="bucket-count">{buckets[key].filter(d => d.status === "taken").length} / {buckets[key].length} {lang === "si" ? "සම්පූර්ණයි" : "complete"}</span></div>{buckets[key].map(renderDoseCard)}</section>) : doses.map(renderDoseCard)}
    </>}
    <footer className="today-footer"><p className="care-note">{DISCLAIMER}</p><details className="support-details"><summary>{lang === "si" ? "මතක් කිරීම් සහ සහාය" : "Reminders & support"}</summary><Reminders /><div className="missed-check"><p>Review the schedule for missed doses and update caregiver alerts.</p><button className="btn btn-secondary" onClick={checkMissed} disabled={checking}>{checking ? "Checking…" : t("checkMissedBtn")}</button></div></details></footer>
    {detailDose && <MedicationInfo dose={detailDose} lang={lang} onClose={() => setDetailDose(null)} />}
    {doubleDoseModal && <div className="modal-overlay"><div className="modal-content safety-dialog" role="dialog" aria-modal="true" aria-labelledby="safety-title"><span className="safety-dialog-icon"><Icon name="lock" size={30}/></span><h2 id="safety-title">{t("doubleDoseWarningTitle")}</h2><p className="safety-medication">{doubleDoseModal.medicationName}</p><div className="safety-facts"><p>{t("takenAtTime")} <strong>{doubleDoseModal.takenAt}</strong></p><p>Next scheduled dose <strong>{doubleDoseModal.nextTime}</strong></p></div><p>{t("doubleDoseWarningBody")}</p><button autoFocus className="btn btn-primary" onClick={() => setDoubleDoseModal(null)}>{lang === "si" ? "තේරුණා — නැවත ගන්නේ නැහැ" : "Understood — do not retake"}</button></div></div>}
  </div>;
}
