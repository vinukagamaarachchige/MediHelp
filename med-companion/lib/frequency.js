export function timesPerDay(frequency) {
  const f = (frequency || "").toLowerCase();
  if (f.includes("four times") || f.includes("4 times") || f.includes("qid")) return 4;
  if (f.includes("three times") || f.includes("3 times") || f.includes("tid")) return 3;
  if (f.includes("twice") || f.includes("two times") || f.includes("2 times") || f.includes("bid")) return 2;
  return 1; // default: once daily
}

