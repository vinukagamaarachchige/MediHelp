// Web Speech API & Web Audio Synthesizer for Elder Voice Reminders

// Gentle audio chime generator using browser native Web Audio API
export function playChime(type = "success") {
  if (typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === "warning") {
      // Urgent double-dose chime: two attention pulses
      const osc1 = ctx.createOscillator();
      
      const gain = ctx.createGain();

      osc1.type = "sine";
      
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc1.frequency.setValueAtTime(330, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc1.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);
      osc1.onended = () => ctx.close();
    } else {
      // Pleasant reminder / confirmation chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => ctx.close();
    }
  } catch (e) {
    // Audio context may require prior user interaction
  }
}

// Speak medication reminder aloud using SpeechSynthesis
export function speakDoseReminder({
  medicationName,
  strength = "",
  dose = "1 tablet",
  timingLabel = "with meals",
  time = "",
  pillColor = "white",
  pillShape = "round",
  lang = "en",
}) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  playChime("success");

  window.speechSynthesis.cancel(); // stop any ongoing speech

  let text = "";
  if (lang === "si") {
    text = `මතක් කිරීමයි. වේලාව ${time}. කරුණාකර ${timingLabel} ${medicationName} ${dose} ලබා ගන්න.`;
  } else {
    text = `Medication reminder. It is ${time}. Please take your ${pillColor} ${pillShape} ${medicationName} ${strength}, ${dose}, ${timingLabel}.`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "si" ? "si-LK" : "en-US";
  utterance.rate = 0.85; // slightly slower cadence for elder clarity
  utterance.pitch = 1.05;

  // Pick voice if available
  const voices = window.speechSynthesis.getVoices();
  if (lang === "si") {
    const siVoice = voices.find((v) => v.lang.startsWith("si") || v.lang.includes("Sinhala"));
    if (siVoice) utterance.voice = siVoice;
  } else {
    const enVoice = voices.find((v) => v.lang.startsWith("en") && v.name.includes("Natural"));
    if (enVoice) utterance.voice = enVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// Speak double-dose safety warning
export function speakDoubleDoseWarning({ medicationName, takenAt, nextTime, lang = "en" }) {
  if (typeof window === "undefined") return;
  playChime("warning");
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  let text = "";
  if (lang === "si") {
    text = `අවවාදයයි! ඔබ මෙම ${medicationName} පෙත්ත අද ${takenAt} ට ලබා ගෙන ඇත. කරුණාකර නැවත පෙති නොගන්න.`;
  } else {
    text = `Safety Alert. You already took your ${medicationName} today at ${takenAt}. Please do not take another pill right now.`;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "si" ? "si-LK" : "en-US";
  utterance.rate = 0.85;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}
