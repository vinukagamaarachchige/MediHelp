// Short, non-verbal confirmation and safety chimes.

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

