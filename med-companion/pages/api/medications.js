import {
  medicationInput,
  publicMedication,
  publicDose,
} from "../../lib/validation";
import { secureApi } from "../../lib/apiSecurity";
import { requireCaregiver } from "../../lib/auth";
import { initialSupply } from "../../lib/supply";
import { readDB, writeDB, nextId, logAgentActivity } from "../../lib/db";
import { buildTodaySchedule, previewScheduleForMeds } from "../../lib/schedule";
import { checkMedicationInteractions } from "../../lib/interactions";

async function handler(req, res) {
  const db = (await readDB());
  if (req.method !== "GET" && !requireCaregiver(req, res, db)) return;

  if (req.method === "GET") {
    const activeOnly = req.query.active === "true";
    const meds = activeOnly
      ? db.medications.filter((m) => !m.retired)
      : db.medications;
    const interactions = checkMedicationInteractions(db.medications);

    return res.status(200).json({
      medications: meds.map(publicMedication),
      routine: Object.fromEntries(
        ["wake", "breakfast", "lunch", "dinner", "sleep"].map((key) => [
          key,
          db.person[key],
        ]),
      ),
      interactions,
    });
  }

  if (req.method === "POST") {
    const { medications: rawMedications, preview } = req.body || {};
    if (
      !Array.isArray(rawMedications) ||
      !rawMedications.length ||
      rawMedications.length > 30
    )
      return res.status(400).json({ error: "Provide 1–30 medications." });
    const medications = rawMedications.map((m) =>
      medicationInput(m, {
        preview: preview === true || req.query.preview === "true",
      }),
    );
    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: "No medications provided" });
    }

    const activeExisting = db.medications.filter((m) => !m.retired);

    // Duplicate detection: compare candidate meds against active medications
    const duplicates = [];
    for (const cand of medications) {
      const match = activeExisting.find(
        (ex) =>
          ex.name.trim().toLowerCase() ===
          (cand.name || "").trim().toLowerCase(),
      );
      if (match) {
        duplicates.push({
          candidateName: cand.name,
          existingMedication: publicMedication(match),
        });
      }
    }

    // Check potential drug-drug interactions (existing active + candidates)
    const combinedForCheck = [...activeExisting, ...medications];
    const interactions = checkMedicationInteractions(combinedForCheck);

    // If this is just a preview/diff request, don't persist
    if (preview || req.query.preview === "true") {
      const previewDoses = previewScheduleForMeds(db.person, medications);
      return res.status(200).json({
        preview: true,
        duplicates,
        interactions,
        previewDoses,
      });
    }

    if (db.medications.length + medications.length > 1000)
      return res
        .status(409)
        .json({
          error:
            "Medication record limit reached. Export and archive old records before adding more.",
        });
    // Persist new medications
    const withIds = medications.map((m) => ({
      id: nextId("med"),
      name: (m.name || "Unnamed medication").trim(),
      strength: m.strength || "",
      dose: m.dose || "1 tablet",
      frequency: m.frequency || "once daily",
      timing: m.timing || "any",
      duration: m.duration || "",
      doctor: m.doctor || "",
      criticality: m.criticality || "normal",
      pillColor: m.pillColor || "white",
      pillShape: m.pillShape || "round",
      currentSupply: initialSupply(m),
      initialSupply: initialSupply(m),
      pillPhoto: m.pillPhoto || "",
      foodInstructions: String(m.foodInstructions || "").slice(0, 2000),
      sideEffects: String(m.sideEffects || "").slice(0, 2000),
      missedDoseInstructions: String(m.missedDoseInstructions || "").slice(
        0,
        2000,
      ),
      instructionSource: String(m.instructionSource || "").slice(0, 300),
      pillImprint: m.pillImprint || "",
      retired: false,
      createdAt: new Date().toISOString(),
    }));

    db.medications = [...db.medications, ...withIds];

    // Rebuild schedule for today with fresh doses for the added medications
    const newDoses = buildTodaySchedule(db.person, withIds);
    db.doses = [...db.doses, ...newDoses];

    // Log the planning activity
    logAgentActivity(
      db,
      "plan",
      `Schedule created: Planned ${newDoses.length} doses for ${withIds.length} new medication(s)`,
      {
        newMedications: withIds.map((m) => `${m.name} (${m.frequency})`),
        dosesScheduled: newDoses.length,
        interactionsDetected: interactions.length,
      },
    );

    await writeDB(db);
    return res.status(200).json({
      medications: withIds,
      doses: newDoses.map(publicDose),
      duplicates,
      interactions,
    });
  }

  res.status(405).json({ error: "Use GET or POST" });
}

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default secureApi(handler, { role: "device" });
