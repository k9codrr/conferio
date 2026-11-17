// pages/api/sse.ts
// Authenticated realtime stream. Every event published on the bus (lib/sse.ts)
// is delivered only to users in its audience (userIds / boardId / teamId /
// platformAdmin). Clients connect with `new EventSource('/api/sse')`
// (see hooks/useSSE.ts — one shared connection per tab).
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscribeAll, type BusMessage } from "@/lib/sse";
import { isPlatformAdminUser } from "@/lib/platform/identity";

export const config = { api: { responseLimit: false } };

const ACCESS_TTL = 30_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).end();

  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // ── Per-connection access cache ───────────────────────────────────────────
  const [memberships, isAdmin] = await Promise.all([
    prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } }),
    isPlatformAdminUser(userId).catch(() => false),
  ]);
  let teamIds = new Set(memberships.map((m) => m.teamId));
  let teamsLoadedAt = Date.now();
  const boardAccess = new Map<string, { ok: boolean; at: number }>();

  const canSeeTeam = async (teamId: string) => {
    if (teamIds.has(teamId)) return true;
    if (Date.now() - teamsLoadedAt > ACCESS_TTL) {
      const fresh = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
      teamIds = new Set(fresh.map((m) => m.teamId));
      teamsLoadedAt = Date.now();
    }
    return teamIds.has(teamId);
  };

  const canSeeBoard = async (boardId: string) => {
    const hit = boardAccess.get(boardId);
    if (hit && Date.now() - hit.at < ACCESS_TTL) return hit.ok;
    const board = await prisma.board.findFirst({
      where: { id: boardId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: { id: true },
    });
    boardAccess.set(boardId, { ok: !!board, at: Date.now() });
    return !!board;
  };

  const allowed = async (data: any): Promise<boolean> => {
    if (!data || typeof data !== "object") return false;
    if (data.platformAdmin) return isAdmin;
    if (Array.isArray(data.userIds)) return data.userIds.includes(userId);
    if (typeof data.userId === "string" && data.privateToUser) return data.userId === userId;
    if (typeof data.boardId === "string") return canSeeBoard(data.boardId);
    if (typeof data.teamId === "string") return canSeeTeam(data.teamId);
    return true;
  };

  // ── Stream ────────────────────────────────────────────────────────────────
  let closed = false;
  const write = (chunk: string) => {
    if (closed) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };

  write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

  const onMessage = ({ event, data }: BusMessage) => {
    if (event === "notification") return; // delivered by /api/notifications/stream
    allowed(data)
      .then((ok) => {
        if (!ok) return;
        // Don't leak audience lists to clients
        const { userIds: _u, ...rest } = data;
        write(`data: ${JSON.stringify({ ...rest, type: data.type ?? event })}\n\n`);
      })
      .catch(() => {});
  };

  const unsubscribe = subscribeAll(onMessage);
  const heartbeat = setInterval(() => write(`:hb\n\n`), 15_000);

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    try {
      res.end();
    } catch {
      /* already closed */
    }
  }

  req.on("close", cleanup);
  req.on("error", cleanup);
}
