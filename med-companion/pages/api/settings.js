import { readDB, writeDB, logAgentActivity } from "../../lib/db";
import { anchorTimes, timesPerDay } from "../../lib/schedule";

export default function handler(req, res) {
  const db = readDB();

  if (req.method === "GET") {
    return res.status(200).json({
      person: db.person,
      caregivers: db.caregivers,
    });
  }

  if (req.method === "POST") {
    const { person, caregivers, verifyPin } = req.body || {};

    // PIN verification endpoint
    if (verifyPin !== undefined) {
      const correct = !db.person.pinEnabled || String(verifyPin) === String(db.person.pin || "1234");
      return res.status(200).json({ valid: correct });
    }

    if (person) {
      db.person = {
        ...db.person,
        ...person,
      };
    }

    if (Array.isArray(caregivers)) {
      db.caregivers = caregivers;
    }

    // Realign pending doses today with any updated meal/wake times
    const activeMeds = db.medications.filter((m) => !m.retired);
    const medById = Object.fromEntries(activeMeds.map((m) => [m.id, m]));

    // If pending doses exist for today, update their scheduledTime to match new anchor times
    const now = new Date();
    for (const dose of db.doses) {
      if (dose.status === "pending") {
        const med = medById[dose.medicationId];
        if (med) {
          const count = timesPerDay(med.frequency);
          const times = anchorTimes(db.person, med.timing, count);
          if (times.length > 0) {
            const [h, m] = times[0].split(":").map(Number);
            const d = new Date(dose.scheduledTime);
            d.setHours(h, m, 0, 0);
            dose.scheduledTime = d.toISOString();
          }
        }
      }
    }

    logAgentActivity(
      db,
      "replan",
      "Settings updated: Elder routine and caregiver contact preferences saved",
      { person: db.person, caregiversCount: db.caregivers.length }
    );

    writeDB(db);
    return res.status(200).json({
      message: "Settings saved successfully",
      person: db.person,
      caregivers: db.caregivers,
    });
  }

  res.status(405).json({ error: "Use GET or POST" });
}
