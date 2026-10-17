import { nextId } from "./db";

// Maps a frequency string to how many times a day, and timing to an
// anchor time from the person's preferences.
export function timesPerDay(frequency) {
  const f = (frequency || "").toLowerCase();
  if (f.includes("four times") || f.includes("4 times") || f.includes("qid")) return 4;
  if (f.includes("three times") || f.includes("3 times") || f.includes("tid")) return 3;
  if (f.includes("twice") || f.includes("two times") || f.includes("2 times") || f.includes("bid")) return 2;
  return 1; // default: once daily
}

export function anchorTimes(person, timing, count) {
  const { wake = "07:00", breakfast = "08:00", lunch = "13:00", dinner = "19:00", sleep = "22:00" } = person || {};
  if (count === 1) {
    if (timing === "with_food") return [breakfast];
    if (timing === "empty_stomach") return [wake];
    return [breakfast];
  }
  if (count === 2) {
    return [breakfast, dinner];
  }
  if (count === 3) {
    return [breakfast, lunch, dinner];
  }
  return [wake, breakfast, lunch, dinner].slice(0, count);
}

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
