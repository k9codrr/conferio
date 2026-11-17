// lib/reminders/scheduler.ts
// In-process reminder loop, started once per Node server from instrumentation.ts.
// Safe with several instances: dispatchDueReminders() takes a Redis lock.
import { dispatchDueReminders } from "./dispatcher";

const INTERVAL_MS = 30_000;
const g = globalThis as unknown as { __reminderLoop?: ReturnType<typeof setInterval> };

export function startReminderScheduler() {
  if (g.__reminderLoop || process.env.DISABLE_REMINDER_SCHEDULER === "1") return;
  const tick = () => dispatchDueReminders().catch((e) => console.warn("[reminders] tick failed:", e?.message));
  // First run shortly after boot so startup isn't slowed down.
  setTimeout(tick, 15_000);
  g.__reminderLoop = setInterval(tick, INTERVAL_MS);
  console.log("[reminders] scheduler started (every 30s)");
}
