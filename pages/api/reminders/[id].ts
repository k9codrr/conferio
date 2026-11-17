// PATCH  /api/reminders/:id { title?, description?, dueDate?, recurrence?, status? }
// DELETE /api/reminders/:id
// The id may be a plain Reminder id or "<kind>:<id>" (reminder | mytask | voice),
// which notification actions use.
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishToUsers, SSE_EVENTS } from "@/lib/sse";
import { parseReminderRef } from "@/lib/reminders/ref";

const RECURRENCES = ["hourly", "daily", "weekdays", "weekly", "monthly", "yearly"] as const;
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date().optional(),
  recurrence: z.enum(RECURRENCES).optional().nullable(),
  status: z.enum(["PENDING", "NOTIFIED", "COMPLETED", "CANCELLED"]).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { kind, id } = parseReminderRef(String(req.query.id));
  if (kind !== "reminder") return res.status(400).json({ error: "Use /snooze for this reminder type" });

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "Reminder not found" });

  if (req.method === "PATCH") {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    const d = parsed.data;
    const reminder = await prisma.reminder.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.dueDate && { dueDate: d.dueDate, notifiedAt: null, status: d.status ?? "PENDING" }),
        ...(d.recurrence !== undefined && { recurrence: d.recurrence, isRecurring: !!d.recurrence }),
        ...(d.status && !d.dueDate && { status: d.status, ...(d.status === "COMPLETED" ? { completedAt: new Date() } : {}) }),
      },
    });
    await publishToUsers([userId], SSE_EVENTS.REMINDER_CHANGED, { action: "updated", reminderId: id });
    return res.status(200).json({ reminder });
  }

  if (req.method === "DELETE") {
    await prisma.reminder.delete({ where: { id } });
    await publishToUsers([userId], SSE_EVENTS.REMINDER_CHANGED, { action: "deleted", reminderId: id });
    return res.status(204).end();
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).end();
}
