// A fixed, non-negotiable rule: this app never tells anyone to start,
// stop, or change a dose, and never diagnoses. This is a crude
// keyword-level guard, not a substitute for careful prompting — but it
// gives you a second, independent check that can't be prompt-injected
// away, and a place to add real tests.

const DIRECTIVE_PATTERNS = [
  /\bstop taking\b/i,
  /\bstart taking\b/i,
  /\bincrease (the )?dose\b/i,
  /\bdecrease (the )?dose\b/i,
  /\bdouble (the )?dose\b/i,
  /\bskip (your|the) (dose|medication)\b/i,
  /\byou (should|must) (stop|start|take|not take)\b/i,
  /\bdiagnos(e|is|ed)\b/i,
  /\bthis (means|indicates) you have\b/i,
];

export function violatesSafetyPolicy(text) {
  if (!text) return false;
  return DIRECTIVE_PATTERNS.some((re) => re.test(text));
}

// Call this on anything LLM-generated before it reaches the UI
// (interaction notes, caregiver messages, re-plan explanations).
export function enforceSafe(text, fallback) {
  if (violatesSafetyPolicy(text)) {
    return (
      fallback ||
      "This needs review — ask your pharmacist or doctor about this medication."
    );
  }
  return text;
}

export const DISCLAIMER =
  "This app helps organise medications and appointments. It is not medical advice, diagnosis, or treatment. Always consult your doctor or pharmacist about your medications.";
