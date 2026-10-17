import { initialSupply } from "../../lib/supply";
import { readDB, writeDB, nextId, logAgentActivity } from "../../lib/db";
import { buildTodaySchedule, previewScheduleForMeds } from "../../lib/schedule";
import { checkMedicationInteractions } from "../../lib/interactions";

export default function handler(req, res) {
  const db = readDB();

  if (req.method === "GET") {
    const activeOnly = req.query.active === "true";
    const meds = activeOnly ? db.medications.filter((m) => !m.retired) : db.medications;
    const interactions = checkMedicationInteractions(db.medications);

    return res.status(200).json({
      medications: meds,
      interactions,
    });
  }

  if (req.method === "POST") {
    const { medications, preview } = req.body || {};
    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ error: "No medications provided" });
    }

    if (medications.some(m => m.currentSupply != null && (!Number.isFinite(m.currentSupply) || m.currentSupply < 0))) return res.status(400).json({error: "Supply must be a non-negative number"});
    if (medications.some(m => m.pillPhoto && (!/^data:image\/(jpeg|png|webp);base64,/.test(m.pillPhoto) || m.pillPhoto.length > 820000))) return res.status(400).json({error: "Invalid pill photo"});
    const activeExisting = db.medications.filter((m) => !m.retired);

    // Duplicate detection: compare candidate meds against active medications
    const duplicates = [];
    for (const cand of medications) {
      const match = activeExisting.find(
        (ex) => ex.name.trim().toLowerCase() === (cand.name || "").trim().toLowerCase()
      );
      if (match) {
        duplicates.push({
          candidateName: cand.name,
          existingMedication: match,
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
      }
    );

    writeDB(db);
    return res.status(200).json({
      medications: withIds,
      doses: newDoses,
      duplicates,
      interactions,
    });
  }

  res.status(405).json({ error: "Use GET or POST" });
}

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };
