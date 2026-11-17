// pages/api/cron/reminders.ts
/**
 * GET /api/cron/reminders
 * Called by a cron job (e.g. Vercel Cron, GitHub Actions, or node-cron) every minute.
 * Finds all PENDING reminders whose dueDate has passed and fires notifications.
 *
 * Secure with a secret header: CRON_SECRET env var.
 *
 * Vercel cron config (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/reminders", "schedule": "* * * * *" }]
 * }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dispatchDueReminders } from "@/lib/reminders/dispatcher";

// Reminders are also dispatched every 30s in-process (lib/reminders/scheduler.ts).
// This endpoint lets an external cron trigger a run too; same logic, same dedupe.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const secret = req.headers["x-cron-secret"] ?? req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const result = await dispatchDueReminders();
  return res.status(200).json(result);
}
