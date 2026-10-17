import { nextId } from "./db";

// Maps a frequency string to how many times a day, and timing to an
// anchor time from the person's preferences.
export { timesPerDay } from "./frequency";
import { timesPerDay } from "./frequency";

export { anchorTimes } from "./routine";
import { anchorTimes } from "./routine";

function dateAtTime(baseDate, hhmm) {
  const [h, m] = (hhmm || "08:00").split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Builds doses for a single day
export function buildDosesForDay(person, medications, targetDate = new Date()) {
  const activeMeds = medications.filter((m) => !m.retired);
  const doses = [];

  for (const med of activeMeds) {
    const count = timesPerDay(med.frequency);
    const times = anchorTimes(person, med.timing, count);
    for (const t of times) {
      doses.push({
        id: nextId("dose"),
        medicationId: med.id,
        scheduledTime: dateAtTime(targetDate, t),
        status: "pending", // pending | taken | skipped | missed
      });
    }
  }

  doses.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
  return doses;
}

// Builds TODAY's doses for all active medications.
export function buildTodaySchedule(person, medications) {
  return buildDosesForDay(person, medications, new Date());
}

// Generates upcoming preview doses for a list of prospective medications
// used in the prescription intake diff/preview screen
export function previewScheduleForMeds(person, candidateMeds, targetDate = new Date()) {
  const preview = [];
  for (const med of candidateMeds) {
    const count = timesPerDay(med.frequency);
    const times = anchorTimes(person, med.timing, count);
    for (const t of times) {
      preview.push({
        medicationName: med.name || "Unnamed Medication",
        strength: med.strength || "",
        dose: med.dose || "1 dose",
        timing: med.timing || "any",
        time: t,
        scheduledTime: dateAtTime(targetDate, t),
        criticality: med.criticality || "normal",
      });
    }
  }
  preview.sort((a, b) => (a.time > b.time ? 1 : -1));
  return preview;
}
