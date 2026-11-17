// GET /api/calendar/feed?from=ISO&to=ISO[&sources=task,meeting][&teamId=]
// Everything dated the signed-in user can see, for the calendar page.
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { CALENDAR_SOURCES, SOURCE_META, getCalendarFeed, type CalendarSource } from "@/lib/calendar/feed";

const MAX_RANGE_DAYS = 120;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let to = req.query.to ? new Date(String(req.query.to)) : new Date(now.getFullYear(), now.getMonth() + 2, 0);
  if (isNaN(+from) || isNaN(+to) || to < from) return res.status(400).json({ error: "Invalid from/to" });
  if ((+to - +from) / 86_400_000 > MAX_RANGE_DAYS) to = new Date(+from + MAX_RANGE_DAYS * 86_400_000);

  const sources = String(req.query.sources || "")
    .split(",")
    .filter((s): s is CalendarSource => (CALENDAR_SOURCES as readonly string[]).includes(s));

  const { items, errors } = await getCalendarFeed({
    userId,
    from,
    to,
    sources,
    teamId: req.query.teamId ? String(req.query.teamId) : undefined,
  });

  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).json({ items, sources: SOURCE_META, errors, from: from.toISOString(), to: to.toISOString() });
}
