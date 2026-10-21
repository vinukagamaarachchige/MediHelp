import { ApiError } from "./apiSecurity";
export const AI_PRESCRIPTION_DISCLAIMER =
  "Prescription extraction may misread names, units or handwriting. Verify every field against the original prescription with your caregiver or pharmacist before saving.";
const prompt = `Extract only what is explicitly written in the prescription. Return a JSON array of objects with name, strength, dose, frequency, timing (with_food, empty_stomach, bedtime, any), duration, doctor and confidence (0 to 1). Unknown text fields must be empty strings. Do not guess medicines, doses, frequency or duration. No advice or extra fields.`;
function confidence(items) {
  const score =
    items.reduce((sum, item) => sum + item.confidence, 0) /
    Math.max(1, items.length);
  const pct = Math.round(score * 100);
  return {
    overallConfidence: score,
    confidencePct: pct,
    confidenceLabel: pct < 80 ? "Review required" : "Verify against original",
    confidenceGrade: pct < 60 ? "low" : pct < 80 ? "medium" : "high",
  };
}
function normalize(input) {
  if (!Array.isArray(input) || !input.length || input.length > 30)
    throw new ApiError(
      "No valid medications were extracted. Enter and verify them manually.",
      422,
    );
  return input.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ApiError(
        "Extraction could not be validated. Enter medicines manually.",
        422,
      );
    const result = {};
    for (const [key, max] of [
      ["name", 120],
      ["strength", 100],
      ["dose", 100],
      ["frequency", 80],
      ["duration", 80],
      ["doctor", 120],
    ]) {
      if (
        item[key] !== undefined &&
        (typeof item[key] !== "string" || item[key].length > max)
      )
        throw new ApiError(
          "Extraction contains invalid fields. Review the original prescription.",
          422,
        );
      result[key] = (item[key] || "").trim();
    }
    if (!result.name)
      throw new ApiError(
        "An extracted medicine has no readable name. Enter it manually.",
        422,
      );
    result.timing = ["with_food", "empty_stomach", "bedtime", "any"].includes(
      item.timing,
    )
      ? item.timing
      : "any";
    result.confidence = Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : 0;
    if (!result.dose || !result.frequency)
      result.confidence = Math.min(0.4, result.confidence);
    return result;
  });
}
function parseText(text) {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 30)
    throw new ApiError("Provide 1–30 medication lines.");
  return normalize(
    lines.map((line) => {
      const strength = line.match(/\b\d+(?:\.\d+)?\s*(?:mcg|mg|ml)\b/i);
      const dose = line.match(
        /\b\d+(?:\.\d+)?\s*(?:tablets?|tabs?|capsules?|caps?|ml)\b/i,
      );
      const frequency = line.match(
        /(?:once|twice|three times|four times)\s+(?:a\s+day|daily)|\bdaily\b/i,
      );
      const duration = line.match(/\b\d+\s*(?:days?|weeks?|months?)\b/i);
      return {
        name: (strength ? line.slice(0, strength.index) : line.split(/[,;]/)[0])
          .replace(/^\d+[.)]\s*/, "")
          .replace(/[ -]+$/, "")
          .trim(),
        strength: strength?.[0] || "",
        dose: dose?.[0] || "",
        frequency: frequency?.[0] || "",
        duration: duration?.[0] || "",
        timing: /with food|with meals|after meals|after food/i.test(line)
          ? "with_food"
          : /before food|before meals|empty stomach/i.test(line)
            ? "empty_stomach"
            : /at night|bedtime/i.test(line)
              ? "bedtime"
              : "any",
        doctor: "",
        confidence: 0.4,
      };
    }),
  );
}
export async function extractMedications({
  text,
  imageBase64,
  imageType = "image/jpeg",
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (imageBase64 && !apiKey)
    throw new ApiError(
      "Image extraction is not configured. Enter prescription text or add medicines manually.",
      503,
    );
  if (!apiKey) {
    const items = parseText(text);
    return {
      items,
      source: "offline_fallback",
      disclaimer: AI_PRESCRIPTION_DISCLAIMER,
      isImageExtraction: false,
      ...confidence(items),
    };
  }
  const content = imageBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageType,
            data: imageBase64.replace(
              /^data:image\/(?:jpeg|png|webp);base64,/,
              "",
            ),
          },
        },
        {
          type: "text",
          text: "Extract only clearly readable medication details.",
        },
      ]
    : [{ type: "text", text }];
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: prompt,
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    throw new ApiError(
      "The extraction provider is unavailable. Enter and verify medicines manually.",
      503,
    );
  }
  if (!response.ok)
    throw new ApiError(
      "The extraction provider could not process this prescription. Enter it manually or retry later.",
      503,
    );
  let items;
  try {
    const data = await response.json();
    const raw =
      data.content
        ?.map((b) => (typeof b.text === "string" ? b.text : ""))
        .join("") || "[]";
    if (raw.length > 64000) throw new Error();
    items = normalize(JSON.parse(raw.replace(/```json|```/g, "").trim()));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "The extracted response could not be validated. Enter medicines manually.",
      422,
    );
  }
  return {
    items,
    source: imageBase64 ? "llm_vision" : "llm",
    disclaimer: AI_PRESCRIPTION_DISCLAIMER,
    isImageExtraction: !!imageBase64,
    ...confidence(items),
  };
}
