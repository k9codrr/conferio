// GET  /api/reminders?from=&to=&status=   → the signed-in user's reminders
// POST /api/reminders { title, description?, dueDate, recurrence?, taskId?, meetingId?, timezone? }
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishToUsers, SSE_EVENTS } from "@/lib/sse";

export const RECURRENCES = ["hourly", "daily", "weekdays", "weekly", "monthly", "yearly"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.coerce.date(),
  recurrence: z.enum(RECURRENCES).optional().nullable(),
  timezone: z.string().max(64).optional(),
  taskId: z.string().optional().nullable(),
  meetingId: z.string().optional().nullable(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const where: any = { userId };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.from || req.query.to) {
      where.dueDate = {
        ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { lte: new Date(String(req.query.to)) } : {}),
      };
    }
    const reminders = await prisma.reminder.findMany({ where, orderBy: { dueDate: "asc" }, take: 500 });
    return res.status(200).json({ reminders });
  }

  if (req.method === "POST") {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    const d = parsed.data;
    if (d.taskId) {
      const ok = await prisma.task.findFirst({
        where: { id: d.taskId, column: { board: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } } },
        select: { id: true },
      });
      if (!ok) return res.status(403).json({ error: "No access to that task" });
    }
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: d.title,
        description: d.description ?? null,
        dueDate: d.dueDate,
        timezone: d.timezone ?? "UTC",
        isRecurring: !!d.recurrence,
        recurrence: d.recurrence ?? null,
        taskId: d.taskId ?? null,
        meetingId: d.meetingId ?? null,
      },
    });
    await publishToUsers([userId], SSE_EVENTS.REMINDER_CHANGED, { action: "created", reminderId: reminder.id });
    return res.status(201).json({ reminder });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end();
}
