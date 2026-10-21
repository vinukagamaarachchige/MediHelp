export function isOverdue(dose, now = Date.now()) {
  if (dose.status === "missed") return true;
  const grace = dose.medication?.criticality === "critical" ? 10 : 30;
  return dose.status === "pending" && now >= new Date(dose.scheduledTime).getTime() + grace * 60000;
}
