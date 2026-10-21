import Dialog from "./Dialog";
import { routineLabel } from "../lib/pills";

export default function MedicationInfo({ dose, lang, onClose }) {
  const med = dose.medication || {};
  return <Dialog title={`${med.name} details`} onClose={onClose}>
    <h2>💊 {med.name}</h2><p>{med.strength} · {med.dose}</p>
    {med.pillPhoto && <img className="medicine-detail-photo" src={med.pillPhoto} alt="Actual pill or blister pack reference" />}
    <dl className="medicine-facts"><dt>Appearance</dt><dd>{med.pillColor || "Not recorded"} {med.pillShape || ""}{med.pillImprint && ` · Imprint: ${med.pillImprint}`}</dd><dt>Scheduled instructions</dt><dd>{routineLabel(dose, med, lang)} · {med.frequency}</dd></dl>
    {med.criticality === "critical" && <p className="critical-note"><span aria-hidden="true">⚠️</span> Critical medication</p>}
    <p className="instruction-attribution">{med.instructionSource ? `Recorded source: ${med.instructionSource}` : "No clinician or pharmacy safety instructions have been recorded yet."}</p>
    {[['Food and water instructions',med.foodInstructions],['Side effects to watch for',med.sideEffects],['If a dose is missed',med.missedDoseInstructions]].map(([title,text]) => <section className="medicine-instruction" key={title}><h3>{title}</h3><p>{text || "Not recorded. Ask your pharmacist or prescriber and follow the medicine’s patient leaflet."}</p></section>)}
    <p className="care-note">These notes are entered by your caregiver from the stated source. Companion does not verify or replace professional advice.</p>
    <button className="btn btn-primary" onClick={onClose}>Close details</button>
  </Dialog>;
}
