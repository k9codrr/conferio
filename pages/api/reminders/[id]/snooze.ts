// POST /api/reminders/:ref/snooze { minutes?: number }  (ref = "<kind>:<id>" or a Reminder id)
// Snoozes any reminder kind; MyTask / voice reminders are re-scheduled as a Reminder
// so their source rows stay untouched.
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishToUsers, SSE_EVENTS } from "@/lib/sse";
import { parseReminderRef } from "@/lib/reminders/ref";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const minutes = Math.min(24 * 60, Math.max(1, Number(req.body?.minutes) || 10));
  const due = new Date(Date.now() + minutes * 60_000);
  const { kind, id } = parseReminderRef(String(req.query.id));

  if (kind === "reminder") {
    const r = await prisma.reminder.findFirst({ where: { id, userId } });
    if (!r) return res.status(404).json({ error: "Reminder not found" });
    await prisma.reminder.update({ where: { id }, data: { dueDate: due, notifiedAt: null, status: "PENDING" } });
  } else {
    const src =
      kind === "mytask"
        ? await prisma.myTask.findFirst({ where: { id, userId }, select: { title: true, description: true } })
        : await prisma.voiceAgentReminder.findFirst({ where: { id, userId }, select: { title: true, description: true } });
    if (!src) return res.status(404).json({ error: "Reminder not found" });
    await prisma.reminder.create({
      data: { userId, title: src.title, description: src.description, dueDate: due, aiContext: `snoozed:${kind}:${id}` },
    });
  }

  await publishToUsers([userId], SSE_EVENTS.REMINDER_CHANGED, { action: "snoozed", ref: `${kind}:${id}` });
  return res.status(200).json({ ok: true, dueDate: due.toISOString() });
}
