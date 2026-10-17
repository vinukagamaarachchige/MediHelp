import PillDetails from "../../components/PillDetails";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useApp } from "../_app";

const EMPTY_MED = {
  name: "",
  strength: "",
  dose: "1 tablet",
  frequency: "once daily",
  timing: "any",
  duration: "",
  doctor: "",
  criticality: "normal",
  pillColor: "white",
  pillShape: "round",
  currentSupply: null,
  initialSupply: null,
  confidence: 1,
};

// SVG Sample Prescription for Instant Demo Testing
const SAMPLE_PRESCRIPTION_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'><rect width='400' height='260' fill='%23fef9e7' stroke='%23d4b106' stroke-width='3'/><text x='20' y='35' font-family='serif' font-size='18' font-weight='bold' fill='%23111'>Dr. K. Perera, MD - General Practice</text><line x1='20' y1='45' x2='380' y2='45' stroke='%23aaa' stroke-width='1'/><text x='20' y='75' font-family='monospace' font-size='14' fill='%23222'>Patient: Elder (Age 74)</text><text x='20' y='110' font-family='cursive' font-size='17' fill='%23002244'>Rx:</text><text x='35' y='140' font-family='sans-serif' font-size='15' fill='%23111'>1. Atorvastatin 20mg - 1 tab at night</text><text x='35' y='175' font-family='sans-serif' font-size='15' fill='%23111'>2. Metformin 500mg - 1 tab twice daily with meals</text><text x='20' y='230' font-family='serif' font-size='13' fill='%23555'>Signed: Dr. K. Perera</text></svg>";

export default function NewPrescription() {
  const router = useRouter();
  const { t, showToast } = useApp();
  const [tab, setTab] = useState("type"); // "type" | "scan"
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [meds, setMeds] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);
  const [existingMeds, setExistingMeds] = useState([]);
  const [previewSchedule, setPreviewSchedule] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [duplicates, setDuplicates] = useState([]);

  // AI Extraction Confidence & Verification State
  const [extractionMeta, setExtractionMeta] = useState(null);
  const [userVerified, setUserVerified] = useState(false);

  // Load existing medications to detect duplicates
  useEffect(() => {
    async function loadExisting() {
      try {
        const res = await fetch("/api/medications");
        if (res.ok) {
          const data = await res.json();
          setExistingMeds(data.medications || []);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadExisting();
  }, []);

  // Update schedule preview, duplicate warnings, and interaction checks whenever candidate meds change
  useEffect(() => {
    if (meds.length === 0) {
      setPreviewSchedule([]);
      setDuplicates([]);
      setInteractions([]);
      return;
    }

    async function updatePreview() {
      try {
        const res = await fetch("/api/medications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medications: meds, preview: true }),
        });
        if (res.ok) {
          const data = await res.json();
          setPreviewSchedule(data.previewDoses || []);
          setDuplicates(data.duplicates || []);
          setInteractions(data.interactions || []);
        }
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setTimeout(updatePreview, 300);
    return () => clearTimeout(timer);
  }, [meds]);

  // Handle Photo File Upload
  function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  // Use Sample Demo Photo
  function handleUseSamplePhoto() {
    setImagePreview(SAMPLE_PRESCRIPTION_IMAGE);
  }

  async function extract() {
    if (tab === "type" && !text.trim()) return;
    if (tab === "scan" && !imagePreview) return;

    setExtracting(true);
    try {
      const body =
        tab === "scan"
          ? { imageBase64: imagePreview }
          : { text };

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      setExtracting(false);
      setSource(data.source);
      setExtractionMeta({
        overallConfidence: data.overallConfidence,
        confidencePct: data.confidencePct,
        confidenceLabel: data.confidenceLabel,
        confidenceGrade: data.confidenceGrade,
        disclaimer: data.disclaimer,
        isImageExtraction: data.isImageExtraction,
      });
      setUserVerified(false);

      setMeds(
        (data.items || []).map((m) => ({
          ...EMPTY_MED,
          ...m,
        }))
      );
      showToast(`AI extracted ${data.items?.length || 0} medication(s) (${data.confidencePct}% confidence)`, "success");
    } catch (e) {
      setExtracting(false);
      showToast("Extraction failed", "warn");
    }
  }

  function updateMed(i, field, value) {
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }

  function removeMed(i) {
    setMeds((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addBlankMed() {
    setMeds((prev) => [...prev, { ...EMPTY_MED }]);
  }

  const hasUnreviewedLowConfidence = meds.some((m) => (m.confidence ?? 1) < 0.6 && !m._reviewed);

  async function save() {
    if (!userVerified) {
      showToast("Please check the box confirming you verified all fields against the prescription.", "warn");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medications: meds }),
      });
      setSaving(false);
      if (res.ok) {
        showToast("Medications & schedule saved successfully!", "success");
        router.push("/");
      } else {
        showToast("Could not save. Please check fields.", "warn");
      }
    } catch (e) {
      setSaving(false);
      showToast("Error saving medications", "warn");
    }
  }

  return (
    <div>
      <h1>➕ {t("addPrescription")}</h1>

      {meds.length === 0 && (
        <div className="card">
          {/* Intake Method Tabs */}
          <div className="tab-container">
            <button
              className={`tab-btn ${tab === "type" ? "active" : ""}`}
              onClick={() => setTab("type")}
            >
              ⌨️ {t("typeOption")}
            </button>
            <button
              className={`tab-btn ${tab === "scan" ? "active" : ""}`}
              onClick={() => setTab("scan")}
            >
              📸 {t("scanOption")} <span className="badge-pro">{t("proBadge")}</span>
            </button>
          </div>

          {tab === "scan" && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  background: "var(--accent-light)",
                  border: "1px solid var(--accent)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  marginBottom: 16,
                }}
              >
                <strong>✨ Pro Vision Scanner:</strong> {t("proNotice")} Upload or snap a photo of the doctor&apos;s prescription slip for automatic vision recognition.
              </div>

              <div className="photo-preview-box">
                {imagePreview ? (
                  <div>
                    <img
                      src={imagePreview}
                      alt="Prescription Preview"
                      className="photo-preview-img"
                    />
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setImagePreview(null)}
                      >
                        Remove &amp; Choose Another
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                      Upload Prescription Photo
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      style={{ maxWidth: 300, margin: "10px auto" }}
                    />
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleUseSamplePhoto}
                      >
                        🧪 Try Sample Prescription Slip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "type" && (
            <div>
              <p className="dose-sub" style={{ marginBottom: 10 }}>
                Paste the prescription text below. You can also add or edit items manually.
              </p>
              <textarea
                rows={7}
                placeholder={
                  "Example:\nMetformin 500mg, 1 tablet twice daily with food, 30 days, Dr. Silva\nAtorvastatin 20mg, 1 tablet once daily, 30 days, Dr. Silva"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              className="btn btn-primary"
              onClick={extract}
              disabled={extracting || (tab === "type" ? !text.trim() : !imagePreview)}
            >
              {extracting ? "Extracting medications with AI…" : "🔍 Extract Medications"}
            </button>
            <button className="btn btn-secondary" onClick={addBlankMed}>
              + Enter Manually
            </button>
          </div>
        </div>
      )}

      {/* Review & Side-by-Side Comparison Screen */}
      {meds.length > 0 && (
        <>
          {/* 1. Prominent AI Confidence Score Card */}
          {extractionMeta && (
            <div
              className="card"
              style={{
                background: "var(--card)",
                border: "2px solid var(--accent)",
                borderRadius: 14,
                padding: "20px",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "var(--accent-light)",
                      color: "var(--accent)",
                    }}
                  >
                    AI Vision Analysis Complete
                  </span>
                  <h3 style={{ margin: "8px 0 4px", fontSize: 20 }}>
                    🎯 {t("aiConfidenceScore")}:{" "}
                    <span
                      style={{
                        color:
                          extractionMeta.confidenceGrade === "high"
                            ? "var(--ok)"
                            : extractionMeta.confidenceGrade === "medium"
                            ? "var(--warn)"
                            : "var(--danger)",
                      }}
                    >
                      {extractionMeta.confidencePct}%
                    </span>
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                    {extractionMeta.confidenceLabel} · {meds.length} medication(s) identified
                  </p>
                </div>

                {/* Visual Progress Bar */}
                <div style={{ minWidth: 180 }}>
                  <div
                    style={{
                      height: 10,
                      width: "100%",
                      background: "var(--card-subtle)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${extractionMeta.confidencePct}%`,
                        background:
                          extractionMeta.confidenceGrade === "high"
                            ? "var(--ok)"
                            : extractionMeta.confidenceGrade === "medium"
                            ? "var(--warn)"
                            : "var(--danger)",
                        borderRadius: 999,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    <span>0% (Low)</span>
                    <span>100% (High)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Mandatory Medical & AI Disclaimer Banner */}
          <div
            style={{
              background: "#fffbeb",
              border: "2px solid #f59e0b",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              color: "#92400e",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div>
                <strong style={{ fontSize: 15, display: "block", marginBottom: 4 }}>
                  {t("aiDisclaimerTitle")}
                </strong>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                  {t("aiDisclaimerText")}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Explicit Callout Prompt to Recheck */}
          <div
            style={{
              background: "var(--accent-light)",
              border: "1px solid var(--accent)",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>🔍</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              {t("recheckPrompt")}
            </span>
          </div>

          {/* Duplicate Medication Detection Banner */}
          {duplicates.length > 0 && (
            <div
              style={{
                background: "var(--warn-bg)",
                border: "2px solid var(--warn)",
                color: "var(--text)",
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 20,
              }}
            >
              <strong>⚠️ Duplicate Medication Alert:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {duplicates.map((dup, i) => (
                  <li key={i}>
                    <strong>{dup.candidateName}</strong> matches existing active medication &ldquo;
                    {dup.existingMedication?.name}&rdquo; ({dup.existingMedication?.strength}).
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 13, margin: "6px 0 0", color: "var(--muted)" }}>
                You may proceed if this is a dosage renewal, or edit the name if it is distinct.
              </p>
            </div>
          )}

          {/* Potential Drug Interactions Banner */}
          {interactions.length > 0 && (
            <div
              style={{
                background: "#fef2f2",
                border: "2px solid var(--danger)",
                color: "#991b1b",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: "0 0 8px", color: "var(--danger)" }}>
                ⚠️ Potential Drug Interaction Flagged
              </h3>
              {interactions.map((inter, i) => (
                <div
                  key={i}
                  style={{
                    background: "white",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    color: "#1c1c1c",
                  }}
                >
                  <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
                    {inter.medicationA} + {inter.medicationB} ({inter.severity.toUpperCase()})
                  </p>
                  <p style={{ margin: "0 0 6px", fontSize: 14, color: "#4b5563" }}>
                    {inter.mechanism}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "var(--accent-light)",
                      padding: 8,
                      borderRadius: 6,
                    }}
                  >
                    💬 Pharmacist Inquiry: {inter.pharmacistQuestion}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2>Review Extracted Medications</h2>

          {/* Side-by-Side View if Photo Present */}
          <div className={imagePreview ? "side-by-side" : ""}>
            {imagePreview && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>📷 Original Doctor Slip</h3>
                  <span className="status-pill status-upcoming">Photo Reference</span>
                </div>
                <img
                  src={imagePreview}
                  alt="Original Prescription"
                  style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                  Carefully compare every extracted drug name, dose number, and frequency on the right directly against this image.
                </p>
              </div>
            )}

            <div>
              {meds.map((m, i) => {
                const confPct = Math.round((m.confidence ?? 1) * 100);
                const lowConfidence = (m.confidence ?? 1) < 0.6;
                return (
                  <div
                    className="card"
                    key={i}
                    style={{
                      borderLeft: lowConfidence ? "6px solid var(--danger)" : "6px solid var(--ok)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>Medication #{i + 1}</span>
                      <span
                        className={`status-pill ${
                          confPct >= 80 ? "status-taken" : confPct >= 60 ? "status-skipped" : "status-missed"
                        }`}
                      >
                        Confidence: {confPct}%
                      </span>
                    </div>

                    {lowConfidence && (
                      <p className="confidence-low" style={{ marginBottom: 10 }}>
                        ⚠️ Low AI confidence ({confPct}%) — please verify spelling and dosage against the slip.
                      </p>
                    )}

                    <label>Medication Name</label>
                    <input
                      value={m.name}
                      onChange={(e) => updateMed(i, "name", e.target.value)}
                      placeholder="e.g. Metformin"
                    />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label>Strength</label>
                        <input
                          value={m.strength}
                          onChange={(e) => updateMed(i, "strength", e.target.value)}
                          placeholder="e.g. 500mg"
                        />
                      </div>
                      <div>
                        <label>Dose</label>
                        <input
                          value={m.dose}
                          onChange={(e) => updateMed(i, "dose", e.target.value)}
                          placeholder="e.g. 1 tablet"
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label>Frequency</label>
                        <select
                          value={m.frequency}
                          onChange={(e) => updateMed(i, "frequency", e.target.value)}
                        >
                          <option value="once daily">Once daily</option>
                          <option value="twice daily">Twice daily</option>
                          <option value="three times a day">Three times a day</option>
                          <option value="four times a day">Four times a day</option>
                        </select>
                      </div>
                      <div>
                        <label>Timing with Food</label>
                        <select
                          value={m.timing}
                          onChange={(e) => updateMed(i, "timing", e.target.value)}
                        >
                          <option value="bedtime">Before bedtime</option><option value="after_lunch">After lunch</option><option value="after_dinner">After dinner</option><option value="any">Any time</option>
                          <option value="with_food">With food / after meals</option>
                          <option value="empty_stomach">Empty stomach / before meals</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label>Duration</label>
                        <input
                          value={m.duration}
                          onChange={(e) => updateMed(i, "duration", e.target.value)}
                          placeholder="e.g. 30 days"
                        />
                      </div>
                      <div>
                        <label>Criticality</label>
                        <select
                          value={m.criticality}
                          onChange={(e) => updateMed(i, "criticality", e.target.value)}
                        >
                          <option value="normal">Normal (30m grace)</option>
                          <option value="critical">Critical (10m grace escalation)</option>
                        </select>
                      </div>
                    </div>

                    <label>Prescribing Doctor</label>
                    <input
                      value={m.doctor}
                      onChange={(e) => updateMed(i, "doctor", e.target.value)}
                      placeholder="e.g. Dr. Silva"
                    />

                    <PillDetails med={m} onChange={changes => Object.entries(changes).forEach(([key, value]) => updateMed(i, key, value))} />
                    {/* Pill Appearance Tagging & Supply Input */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, background: "var(--card-subtle)", padding: 10, borderRadius: 8, marginBottom: 10 }}>
                      <div>
                        <label>🎨 Pill Color</label>
                        <select
                          value={m.pillColor || "white"}
                          onChange={(e) => updateMed(i, "pillColor", e.target.value)}
                        >
                          <option value="white">⚪ White</option>
                          <option value="yellow">🟡 Yellow</option>
                          <option value="blue">🔵 Blue</option>
                          <option value="pink">🌸 Pink</option>
                          <option value="red">🔴 Red</option>
                          <option value="green">🟢 Green</option>
                          <option value="orange">🟠 Orange</option>
                        </select>
                      </div>
                      <div>
                        <label>💊 Shape</label>
                        <select
                          value={m.pillShape || "round"}
                          onChange={(e) => updateMed(i, "pillShape", e.target.value)}
                        >
                          <option value="round">Round Tablet</option>
                          <option value="oval">Oval Tablet</option>
                          <option value="capsule">Capsule</option>
                        </select>
                      </div>
                      <div>
                        <label>📦 Bottle Supply</label>
                        <input
                          type="number"
                          value={m.currentSupply ?? ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : Number(e.target.value);
                            updateMed(i, "currentSupply", val);
                            updateMed(i, "initialSupply", val);
                          }}
                          min={1}
                        />
                      </div>
                    </div>

                    {lowConfidence && (
                      <label style={{ fontSize: 14, marginTop: 8, display: "flex", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!m._reviewed}
                          onChange={(e) => updateMed(i, "_reviewed", e.target.checked)}
                          style={{ width: "auto", marginRight: 8, marginBottom: 0 }}
                        />
                        I have checked this entry against doctor handwriting
                      </label>
                    )}

                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-skip" onClick={() => removeMed(i)}>
                        Remove Entry
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                className="btn btn-secondary"
                onClick={addBlankMed}
                style={{ width: "100%", marginBottom: 16 }}
              >
                + Add Another Medication
              </button>
            </div>
          </div>

          {/* Schedule Diff / Preview Before Saving */}
          {previewSchedule.length > 0 && (
            <div className="card" style={{ background: "var(--card-subtle)" }}>
              <h3>📅 {t("diffTitle")}</h3>
              <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px" }}>
                The scheduling agent will automatically generate the following doses today based on routine anchor times:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {previewSchedule.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--card)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 16 }}>{p.time}</strong> — {p.medicationName} ({p.strength})
                      <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 8 }}>
                        {p.timing === "with_food" ? "With meal" : p.timing === "empty_stomach" ? "Empty stomach" : "Any time"}
                      </span>
                    </div>
                    {p.criticality === "critical" && (
                      <span className="status-pill status-missed">Critical</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Mandatory Recheck Verification Checkbox Gate */}
          <div
            className="card"
            style={{
              background: userVerified ? "var(--ok-bg)" : "var(--card)",
              border: userVerified ? "2px solid var(--ok)" : "2px solid var(--accent)",
              padding: 16,
              marginTop: 20,
              transition: "all 0.2s ease",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
                margin: 0,
                color: userVerified ? "var(--ok)" : "var(--text)",
              }}
            >
              <input
                type="checkbox"
                checked={userVerified}
                onChange={(e) => setUserVerified(e.target.checked)}
                style={{
                  width: 20,
                  height: 20,
                  marginRight: 12,
                  marginBottom: 0,
                  cursor: "pointer",
                }}
              />
              ✓ {t("verifiedCheckbox")}
            </label>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving || meds.length === 0 || !userVerified || hasUnreviewedLowConfidence}
              style={{ fontSize: 18, padding: "14px 28px" }}
            >
              {saving ? "Saving…" : `✓ ${t("confirmAndBuild")}`}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setMeds([]);
                setImagePreview(null);
                setText("");
                setExtractionMeta(null);
                setUserVerified(false);
              }}
            >
              Start Over
            </button>
          </div>

          {!userVerified && (
            <p style={{ color: "var(--warn)", fontSize: 14, fontWeight: 600, marginTop: 10 }}>
              ⚠️ Please check the verification box above to confirm that you have re-checked what was entered.
            </p>
          )}

          {hasUnreviewedLowConfidence && (
            <p className="confidence-low" style={{ marginTop: 8 }}>
              Please check the box confirming review for each low-confidence entry before proceeding.
            </p>
          )}
        </>
      )}
    </div>
  );
}
