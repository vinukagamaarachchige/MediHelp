import { timesPerDay } from "./frequency";

export function unitsPerDose(med) {
  const match = String(med.dose || "1 tablet").match(/^\s*(\d+(?:\.\d+)?|½)\s*(?:tablets?|tabs?|pills?|capsules?|caps?)\b/i);
  return match ? (match[1] === "½" ? 0.5 : Number(match[1])) : null;
}
export function dailyUnits(med) {
  const units = unitsPerDose(med);
  return units > 0 ? units * timesPerDay(med.frequency) : null;
}
export function daysRemaining(med) {
  const daily = dailyUnits(med);
  return daily && Number.isFinite(med.currentSupply) ? med.currentSupply / daily : null;
}
export function initialSupply(med) {
  if (Number.isFinite(med.currentSupply) && med.currentSupply >= 0) return med.currentSupply;
  const days = String(med.duration || "").match(/^(\d+)\s*days?$/i);
  return days && dailyUnits(med) ? Number(days[1]) * dailyUnits(med) : null;
}
