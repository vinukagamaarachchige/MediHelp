import { publicDose } from "../../lib/validation";
import { secureApi } from "../../lib/apiSecurity";
import { requireCaregiver } from "../../lib/auth";
import { readDB, writeDB } from "../../lib/db";
import { timesPerDay, anchorTimes, buildTodaySchedule } from "../../lib/schedule";

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDateKey(date) {
  return date.toISOString().split("T")[0];
}

function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  const db = readDB();
  if (["history", "adherence"].includes(req.query.range)) { res.setHeader("Cache-Control", "no-store"); if (!requireCaregiver(req, res, db)) return; }
  const medById = Object.fromEntries(db.medications.map((m) => [m.id, m]));
  const activeMeds = db.medications.filter((m) => !m.retired);
  const now = new Date();
  const missingMeds = activeMeds.filter(m => !db.doses.some(d => d.medicationId === m.id && isSameDay(new Date(d.scheduledTime), now)));
  if (missingMeds.length) {
    db.doses.push(...buildTodaySchedule(db.person, missingMeds));
    writeDB(db);
  }

  // If 7-day adherence history requested for the caregiver chart
  if (req.query.range === "history" || req.query.range === "adherence") {
    const history = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - i);
      const dateKey = formatDateKey(targetDate);
      const dayName = targetDate.toLocaleDateString("en-US", { weekday: "short" });

      const dayDoses = db.doses.filter((d) => isSameDay(new Date(d.scheduledTime), targetDate));
      const total = dayDoses.length;
      const taken = dayDoses.filter((d) => d.status === "taken").length;
      const skipped = dayDoses.filter((d) => d.status === "skipped").length;
      const missed = dayDoses.filter((d) => d.status === "missed").length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : null;

      history.push({
        date: dateKey,
        dayName,
        total,
        taken,
        skipped,
        missed,
        rate: adherenceRate,
      });
    }
    return res.status(200).json(history);
  }

  // If weekly forecast/schedule view requested
  if (req.query.range === "week") {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + i);
      const isCurrentDay = i === 0;

      // Existing doses in database for that day
      let dayDoses = db.doses
        .filter((d) => isSameDay(new Date(d.scheduledTime), targetDate))
        .map((d) => ({ ...d, medication: medById[d.medicationId] || null }));

      // If it's a future day and no doses recorded yet, project upcoming doses
      if (!isCurrentDay && dayDoses.length === 0 && activeMeds.length > 0) {
        dayDoses = [];
        for (const med of activeMeds) {
          const count = timesPerDay(med.frequency);
          const times = anchorTimes(db.person, med.timing, count);
          for (const t of times) {
            const [h, m] = t.split(":").map(Number);
            const projDate = new Date(targetDate);
            projDate.setHours(h, m, 0, 0);

            dayDoses.push({
              id: `proj_${med.id}_${i}_${t}`,
              medicationId: med.id,
              medication: med,
              scheduledTime: projDate.toISOString(),
              status: "upcoming",
              isProjected: true,
            });
          }
        }
      }

      dayDoses.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

      days.push({
        date: formatDateKey(targetDate),
        dayName: targetDate.toLocaleDateString("en-US", { weekday: "short" }),
        displayDate: targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        isToday: isCurrentDay,
        doses: dayDoses.map(publicDose),
      });
    }

    return res.status(200).json(days);
  }

  // Default: Today's doses as array (backwards compatible with existing /)
  const todayDoses = db.doses
    .filter((d) => isSameDay(new Date(d.scheduledTime), now))
    .map((d) => ({ ...d, medication: medById[d.medicationId] || null }))
    .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

  return res.status(200).json(todayDoses.map(publicDose));
}

export default secureApi(handler, { role: "device" });
export const config = {api:{bodyParser:{sizeLimit:"32kb"}}};
