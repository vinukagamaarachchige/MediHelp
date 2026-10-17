// Pill Visual Colors, Shapes, and Routine Bucket Helpers

export const PILL_COLORS = [
  { id: "white", label: "White", hex: "#ffffff", border: "#cbd5e1" },
  { id: "yellow", label: "Yellow", hex: "#fef08a", border: "#eab308" },
  { id: "blue", label: "Blue", hex: "#bae6fd", border: "#0284c7" },
  { id: "pink", label: "Pink", hex: "#fbcfe8", border: "#db2777" },
  { id: "red", label: "Red", hex: "#fca5a5", border: "#dc2626" },
  { id: "green", label: "Green", hex: "#bbf7d0", border: "#16a34a" },
  { id: "orange", label: "Orange", hex: "#fed7aa", border: "#ea580c" },
];

export const PILL_SHAPES = [
  { id: "round", label: "Round Tablet", borderRadius: "50%" },
  { id: "oval", label: "Oval Tablet", borderRadius: "40%" },
  { id: "capsule", label: "Two-Tone Capsule", borderRadius: "999px" },
];

// Helper to get color hex
export function getPillColorHex(colorId = "white") {
  const match = PILL_COLORS.find((c) => c.id === (colorId || "").toLowerCase());
  return match || PILL_COLORS[0];
}

// Maps scheduled time to Elder Routine Bucket
export function getRoutineBucket(isoTime) {
  if (!isoTime) return "morning";
  const d = new Date(isoTime);
  const hour = d.getHours();

  if (hour < 11) return "morning";
  if (hour < 16) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

export function getBucketMeta(bucketKey) {
  const BUCKETS = {
    morning: { id: "morning", titleKey: "bucketMorning", icon: "🌅", timeRange: "Breakfast / Morning" },
    afternoon: { id: "afternoon", titleKey: "bucketAfternoon", icon: "☀️", timeRange: "Lunch / Afternoon" },
    evening: { id: "evening", titleKey: "bucketEvening", icon: "🌆", timeRange: "Dinner / Evening" },
    night: { id: "night", titleKey: "bucketNight", icon: "🌙", timeRange: "Bedtime / Night" },
  };
  return BUCKETS[bucketKey] || BUCKETS.morning;
}

export function routineLabel(dose, med, lang = "en") {
 const bucket = getRoutineBucket(dose.scheduledTime);
 if (["night", "bedtime"].includes(med.timing)) return lang === "si" ? "නින්දට පෙර" : "Before bedtime";
 if (med.timing === "empty_stomach") return lang === "si" ? "හිස් බඩ" : "On an empty stomach";
 if (med.timing === "after_lunch") return lang === "si" ? "දහවල් ආහාරයෙන් පසු" : "After lunch";
 if (med.timing === "after_dinner") return lang === "si" ? "රාත්‍රී ආහාරයෙන් පසු" : "After dinner";
 if (med.timing === "with_food") {
  return ({morning: ["With breakfast", "උදෑසන ආහාරය සමඟ"], afternoon: ["With lunch", "දහවල් ආහාරය සමඟ"], evening: ["With dinner", "රාත්‍රී ආහාරය සමඟ"], night: ["With food", "ආහාර සමඟ"]})[bucket][lang === "si" ? 1 : 0];
 }
 return ({morning:["Morning", "උදෑසන"],afternoon:["Afternoon", "දහවල්"],evening:["Evening", "සවස"],night:["Night", "රාත්‍රී"]})[bucket][lang === "si" ? 1 : 0];
}
