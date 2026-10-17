export function anchorTimes(person, timing, count) {
  const { wake = "07:00", breakfast = "08:00", lunch = "13:00", dinner = "19:00", sleep = "22:00" } = person || {};
  if (count === 1) {
    if (["bedtime", "night"].includes(timing)) return [sleep];
    if (timing === "after_lunch") return [lunch];
    if (timing === "after_dinner") return [dinner];
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

