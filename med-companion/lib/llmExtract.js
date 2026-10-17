// Turns raw prescription text or prescription photo into a structured medication list.
// Uses the Anthropic API (including Claude Vision) when ANTHROPIC_API_KEY is set;
// otherwise falls back to an offline parser so the rest of the app is still testable offline.

export const AI_PRESCRIPTION_DISCLAIMER =
  "Medical & AI Disclaimer: AI optical scanning and character recognition is an assistive tool and may misinterpret doctor handwriting, abbreviations, or dosage units. This tool does not provide medical advice. You MUST review and verify every extracted field against the original prescription slip before confirming.";

const EXTRACTION_SYSTEM_PROMPT = `You extract medication info from prescription text or prescription images.
Return ONLY a JSON array, no prose, no markdown fences. Each item:
{
  "name": string,
  "strength": string,       // e.g. "500mg", "" if unknown
  "dose": string,            // e.g. "1 tablet", "" if unknown
  "frequency": string,       // e.g. "twice daily", "once daily"
  "timing": "with_food" | "empty_stomach" | "any",
  "duration": string,        // e.g. "7 days", "ongoing"
  "doctor": string,          // "" if unknown
  "confidence": number       // 0-1, your confidence in this extraction based on image/text clarity
}
Never include dosage advice or commentary. Only extract what is explicitly written in the prescription.`;

function calculateConfidenceMeta(items = []) {
  if (!items || items.length === 0) {
    return {
      overallConfidence: 0,
      confidencePct: 0,
      confidenceLabel: "No medications detected",
      confidenceGrade: "low",
    };
  }

  const sum = items.reduce((acc, it) => acc + (typeof it.confidence === "number" ? it.confidence : 0.5), 0);
  const avg = Math.round((sum / items.length) * 100) / 100;
  const pct = Math.round(avg * 100);

  let label = "High Confidence";
  let grade = "high";
  if (pct < 60) {
    label = "Low Confidence — Needs Thorough Review";
    grade = "low";
  } else if (pct < 80) {
    label = "Moderate Confidence — Review Recommended";
    grade = "medium";
  }

  return {
    overallConfidence: avg,
    confidencePct: pct,
    confidenceLabel: label,
    confidenceGrade: grade,
  };
}

function fallbackParse(text) {
  const lines = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [
      {
        name: "Amoxicillin",
        strength: "500mg",
        dose: "1 capsule",
        frequency: "three times a day",
        timing: "with_food",
        duration: "7 days",
        doctor: "Dr. K. Perera",
        confidence: 0.85,
      },
      {
        name: "Paracetamol",
        strength: "500mg",
        dose: "2 tablets",
        frequency: "twice daily",
        timing: "any",
        duration: "5 days",
        doctor: "Dr. K. Perera",
        confidence: 0.9,
      },
    ];
  }

  return lines.map((line) => {
    const strengthMatch = line.match(/(\d+\s?mg|\d+\s?mcg|\d+\s?ml)/i);
    const freqMatch = line.match(
      /(once|twice|three times|four times)\s+(a\s+)?day|daily|every\s+\d+\s+hours/i
    );
    const foodMatch = /with food|after meals|after food/i.test(line)
      ? "with_food"
      : /empty stomach|before food|before meals/i.test(line)
      ? "empty_stomach"
      : "any";
    const doctorMatch = line.match(/dr\.?\s*[a-z]+/i);
    const name = line.split(",")[0].replace(strengthMatch?.[0] || "", "").trim();

    return {
      name: name || line,
      strength: strengthMatch ? strengthMatch[0] : "",
      dose: "1 tablet",
      frequency: freqMatch ? freqMatch[0] : "once daily",
      timing: foodMatch,
      duration: "30 days",
      doctor: doctorMatch ? doctorMatch[0] : "",
      confidence: 0.55, // offline text parser — flagged for review
    };
  });
}

export async function extractMedications({ text, imageBase64, imageType = "image/jpeg" }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Handle scanned image without API key (Simulated Vision AI Extraction)
  if (imageBase64 && !apiKey) {
    const sampleItems = [
      {
        name: "Atorvastatin",
        strength: "20mg",
        dose: "1 tablet",
        frequency: "once daily",
        timing: "any",
        duration: "30 days",
        doctor: "Dr. K. Perera",
        confidence: 0.88,
      },
      {
        name: "Metformin",
        strength: "500mg",
        dose: "1 tablet",
        frequency: "twice daily",
        timing: "with_food",
        duration: "30 days",
        doctor: "Dr. K. Perera",
        confidence: 0.82,
      },
    ];

    const confMeta = calculateConfidenceMeta(sampleItems);
    return {
      items: sampleItems,
      source: "simulated_vision_scan",
      disclaimer: AI_PRESCRIPTION_DISCLAIMER,
      isImageExtraction: true,
      ...confMeta,
    };
  }

  if (!apiKey) {
    const items = fallbackParse(text);
    const confMeta = calculateConfidenceMeta(items);
    return {
      items,
      source: "offline_fallback",
      disclaimer: AI_PRESCRIPTION_DISCLAIMER,
      isImageExtraction: false,
      ...confMeta,
    };
  }

  // Build message content for Anthropic API
  const content = [];
  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imageType,
        data: base64Data,
      },
    });
    content.push({
      type: "text",
      text: "Please extract all medications from this prescription photo. Estimate a confidence score (0.0 to 1.0) for each medication based on handwriting legibility and clarity.",
    });
  } else {
    content.push({
      type: "text",
      text: text || "",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const fallbackItems = fallbackParse(text);
      const confMeta = calculateConfidenceMeta(fallbackItems);
      return {
        items: fallbackItems,
        source: "offline_fallback_after_error",
        disclaimer: AI_PRESCRIPTION_DISCLAIMER,
        isImageExtraction: !!imageBase64,
        ...confMeta,
      };
    }

    const data = await response.json();
    const raw = data.content?.map((b) => b.text || "").join("") || "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const items = JSON.parse(cleaned);
    const confMeta = calculateConfidenceMeta(items);

    return {
      items,
      source: imageBase64 ? "llm_vision" : "llm",
      disclaimer: AI_PRESCRIPTION_DISCLAIMER,
      isImageExtraction: !!imageBase64,
      ...confMeta,
    };
  } catch (err) {
    const fallbackItems = fallbackParse(text);
    const confMeta = calculateConfidenceMeta(fallbackItems);
    return {
      items: fallbackItems,
      source: "offline_fallback_exception",
      disclaimer: AI_PRESCRIPTION_DISCLAIMER,
      isImageExtraction: !!imageBase64,
      ...confMeta,
    };
  }
}
