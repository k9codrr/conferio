// pages/api/notifications/stream.ts
/**
 * Server-Sent Events (SSE) endpoint for real-time notification delivery.
 * Connect with: const es = new EventSource('/api/notifications/stream')
 *
 * The client polls this endpoint and receives new notifications as they arrive.
 * Uses long-polling with periodic keep-alive pings.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "lib/auth";
import { prisma } from "@/lib/prisma";
import { publish, subscribeToClipEvent, SSE_EVENTS } from "@/lib/sse";

/**
 * Broadcast a notification to every open stream of a user — in this process
 * and (via Redis) on other instances. Goes through the shared bus in lib/sse.ts
 * because a module-level client map here is NOT shared with the API route that
 * imports this function (each Next.js route is bundled separately).
 */
export function broadcastToUser(userId: string, data: object) {
  publish(SSE_EVENTS.NOTIFICATION, { userIds: [userId], payload: data }).catch(() => {});
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const userId = session.user.id;

  req.socket.setTimeout(0);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  const write = (chunk: string) => {
    if (closed) return;
    try {
      res.write(chunk);
    } catch {
      /* closed */
    }
  };

  const unsubscribe = subscribeToClipEvent(SSE_EVENTS.NOTIFICATION, (data: any) => {
    if (Array.isArray(data?.userIds) && data.userIds.includes(userId)) {
      write(`data: ${JSON.stringify(data.payload)}\n\n`);
    }
  });

  // Unread notifications on connect
  try {
    const unread = await prisma.notification.findMany({
      where: { userId, read: false, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (unread.length > 0) write(`data: ${JSON.stringify({ type: "initial", notifications: unread })}\n\n`);
  } catch (error) {
    console.error("[SSE] Failed to fetch initial notifications:", error);
  }

  const pingInterval = setInterval(() => write(": ping\n\n"), 25_000);

  req.on("close", () => {
    closed = true;
    clearInterval(pingInterval);
    unsubscribe();
  });
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
