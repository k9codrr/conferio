// Notification sounds generated with Web Audio (no audio files to ship).
// Browsers only allow audio after a user gesture, so the context is unlocked
// on the first click/keypress and reused afterwards.

let ctx: AudioContext | null = null;
let unlockBound = false;

const PREF_KEY = "conferio:notificationSound"; // "on" | "off"
const VOL_KEY = "conferio:notificationVolume"; // 0..1

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}
function volume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY) || "");
    return isNaN(v) ? 0.6 : Math.min(1, Math.max(0, v));
  } catch {
    return 0.6;
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call once on app mount: resumes audio on the first user interaction. */
export function bindAudioUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    getCtx()?.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Soft two-note ping for ordinary notifications. */
export function playNotificationSound() {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c || c.state === "suspended") return;
  const v = volume() * 0.35;
  const t = c.currentTime;
  tone(c, 880, t, 0.18, v);
  tone(c, 1320, t + 0.12, 0.25, v * 0.8);
}

/** Louder repeating chime for reminders (3 rounds). */
export function playReminderSound() {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c || c.state === "suspended") return;
  const v = volume() * 0.5;
  const t = c.currentTime;
  for (let round = 0; round < 3; round++) {
    const s = t + round * 0.9;
    tone(c, 659.25, s, 0.3, v, "triangle"); // E5
    tone(c, 783.99, s + 0.15, 0.3, v, "triangle"); // G5
    tone(c, 1046.5, s + 0.3, 0.45, v, "triangle"); // C6
  }
}
