// lib/reminders/dispatcher.ts
//
// Delivers due reminders from all three stores:
//   • Reminder            (calendar / voice agent / API reminders)
//   • MyTask              (the dashboard "Reminders" panel)
//   • VoiceAgentReminder  (proactive voice-agent reminders)
//
// For each due item the user gets: an in-app notification (persisted), a live
// `reminder:due` event (the client rings + shows an alarm toast), and an email
// unless they turned reminder emails off. Run every ~30s by
// lib/reminders/scheduler.ts and on demand by /api/cron/reminders.
import { prisma } from "@/lib/prisma";
import { getRedisClient } from "@/lib/redis";
import { publishToUsers, SSE_EVENTS } from "@/lib/sse";
import { broadcastToUser } from "../../pages/api/notifications/stream";
import { sendEmail } from "@/lib/email/sendEmail";

const MYTASK_WINDOW_MS = 10 * 60_000; // only ring to-dos that became due in the last 10 min
const memoryDedupe = new Map<string, number>();

async function acquireLock(key: string, ttlSec: number): Promise<boolean> {
  try {
    const r = await getRedisClient().set(key, "1", { nx: true, ex: ttlSec });
    return r === "OK";
  } catch {
    return true; // no Redis → single instance, proceed
  }
}

/** Returns true the first time a key is seen (across instances when Redis is up). */
async function firstTime(key: string, ttlSec: number): Promise<boolean> {
  const now = Date.now();
  memoryDedupe.forEach((exp, k) => { if (exp < now) memoryDedupe.delete(k); });
  if (memoryDedupe.has(key)) return false;
  memoryDedupe.set(key, now + ttlSec * 1000);
  return acquireLock(`dedupe:${key}`, ttlSec);
}

function nextOccurrence(from: Date, recurrence?: string | null): Date | null {
  if (!recurrence) return null;
  const d = new Date(from);
  switch (recurrence.toLowerCase()) {
    case "hourly": d.setHours(d.getHours() + 1); break;
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekdays": {
      do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
      break;
    }
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  // Skip occurrences already in the past (e.g. server was down)
  while (d.getTime() < Date.now()) {
    const n = nextOccurrence(d, recurrence);
    if (!n) return null;
    d.setTime(n.getTime());
  }
  return d;
}

async function wantsEmail(userId: string): Promise<boolean> {
  try {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId }, select: { preferences: true } });
    const p = (pref?.preferences ?? {}) as any;
    if (p?.reminders?.email === false || p?.REMINDER_DUE?.email === false || p?.email === false) return false;
  } catch {
    /* default on */
  }
  return true;
}

function reminderEmailHtml(name: string | null, title: string, description: string | undefined, due: Date, link: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f7;padding:24px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #eee">
    <p style="margin:0 0 4px;color:#a16207;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">⏰ Reminder</p>
    <h2 style="margin:0 0 8px;font-size:20px;color:#111">${esc(title)}</h2>
    ${description ? `<p style="margin:0 0 12px;color:#444;font-size:14px;line-height:1.5">${esc(description)}</p>` : ""}
    <p style="margin:0 0 20px;color:#666;font-size:13px">Due ${due.toUTCString()}</p>
    <a href="${link}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open Conferio</a>
    <p style="margin:20px 0 0;color:#999;font-size:11px">Hi ${esc(name || "there")}, you asked Conferio to remind you about this.</p>
  </div></body></html>`;
}

interface DueItem {
  key: string;
  userId: string;
  title: string;
  description?: string;
  dueAt: Date;
  kind: "reminder" | "mytask" | "voice";
  refId: string;
  taskId?: string;
  meetingId?: string;
}

async function deliver(item: DueItem) {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "";
  const link = item.taskId ? `${appUrl}/calendar/page` : `${appUrl}/dashboard`;

  const notification = await prisma.notification.create({
    data: {
      userId: item.userId,
      type: "REMINDER_DUE",
      title: `Reminder: ${item.title}`,
      body: item.description || "Your reminder is due now.",
      data: { reminderId: item.refId, kind: item.kind, dueAt: item.dueAt.toISOString(), sound: "reminder" },
      taskId: item.taskId,
      meetingId: item.meetingId,
      channels: ["in_app", "email", "sound"],
      actions: [{ label: "Snooze 10 min", action: "snooze", endpoint: `/api/reminders/${item.kind}:${item.refId}/snooze`, variant: "secondary" }],
    },
  });

  broadcastToUser(item.userId, { type: "notification", notification });
  await publishToUsers([item.userId], SSE_EVENTS.REMINDER_DUE, {
    reminder: { id: item.refId, kind: item.kind, title: item.title, description: item.description, dueAt: item.dueAt.toISOString() },
  });

  if (await wantsEmail(item.userId)) {
    const user = await prisma.user.findUnique({ where: { id: item.userId }, select: { email: true, name: true } });
    if (user?.email) {
      sendEmail({
        to: user.email,
        subject: `⏰ Reminder: ${item.title}`,
        html: reminderEmailHtml(user.name, item.title, item.description, item.dueAt, link),
        text: `Reminder: ${item.title}\n${item.description ?? ""}\nDue ${item.dueAt.toUTCString()}`,
      }).catch((e) => console.warn("[reminders] email failed:", e?.message));
    }
  }
}

export async function dispatchDueReminders(now = new Date()): Promise<{ processed: number }> {
  // One dispatcher run at a time across all instances.
  if (!(await acquireLock("lock:reminder-dispatch", 25))) return { processed: 0 };

  const [reminders, myTasks, voice] = await Promise.all([
    prisma.reminder.findMany({
      where: { status: "PENDING", dueDate: { lte: now }, notifiedAt: null },
      take: 200,
    }),
    prisma.myTask.findMany({
      where: { itsDone: false, dueTime: { lte: now, gte: new Date(now.getTime() - MYTASK_WINDOW_MS) } },
      select: { id: true, userId: true, title: true, description: true, dueTime: true },
      take: 200,
    }),
    prisma.voiceAgentReminder
      .findMany({ where: { delivered: false, scheduledAt: { lte: now } }, take: 200 })
      .catch(() => [] as any[]),
  ]);

  const items: DueItem[] = [
    ...reminders.map((r) => ({
      key: `reminder:${r.id}:${r.dueDate.getTime()}`, userId: r.userId, title: r.title,
      description: r.description ?? undefined, dueAt: r.dueDate, kind: "reminder" as const, refId: r.id,
      taskId: r.taskId ?? undefined, meetingId: r.meetingId ?? undefined,
    })),
    ...myTasks.map((t) => ({
      key: `mytask:${t.id}:${t.dueTime.getTime()}`, userId: t.userId, title: t.title,
      description: t.description ?? undefined, dueAt: t.dueTime, kind: "mytask" as const, refId: t.id,
    })),
    ...voice.map((v: any) => ({
      key: `voice:${v.id}`, userId: v.userId, title: v.title, description: v.description ?? undefined,
      dueAt: v.scheduledAt, kind: "voice" as const, refId: v.id,
    })),
  ];

  let processed = 0;
  for (const item of items) {
    try {
      if (!(await firstTime(item.key, 24 * 3600))) continue;

      // Mark first so a crash mid-delivery doesn't cause repeats.
      if (item.kind === "reminder") {
        const r = reminders.find((x) => x.id === item.refId)!;
        const next = r.isRecurring ? nextOccurrence(r.dueDate, r.recurrence) : null;
        await prisma.reminder.update({
          where: { id: r.id },
          data: next ? { dueDate: next, notifiedAt: null } : { notifiedAt: now, status: "NOTIFIED" },
        });
      } else if (item.kind === "voice") {
        await prisma.voiceAgentReminder.update({ where: { id: item.refId }, data: { delivered: true, deliveredAt: now } });
      }

      await deliver(item);
      processed++;
    } catch (err: any) {
      console.error(`[reminders] ${item.key} failed:`, err?.message);
    }
  }
  return { processed };
}
