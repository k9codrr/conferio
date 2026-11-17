// /api/rooms/:roomId/sync — realtime transport for whiteboard rooms.
//
// GET  → { access, participants, chat }          (join info)
// POST { clientId, kind, ... }                   (relayed over SSE to the team)
//   kind "update"    { updates: base64[] }        edit+   Yjs updates
//   kind "sync-req"                               view+   ask peers for their state
//   kind "sync-resp" { to, state: base64 }        edit+   reply with full state
//   kind "presence"                               view+   heartbeat
//   kind "leave"                                  view+
//   kind "chat"      { text }                     view+
//   kind "cursor"    { x, y }                     view+   (throttled client-side)
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { publish, SSE_EVENTS } from "@/lib/sse";
import { atLeast, getRoomAccess, type RoomAccess } from "@/lib/whiteboard/access";
import { addChat, colorFor, leave, participants, recentChat, touch } from "@/lib/whiteboard/presence";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

const NEEDS: Record<string, RoomAccess> = {
  update: "edit", "sync-resp": "edit",
  "sync-req": "view", presence: "view", leave: "view", chat: "view", cursor: "view",
};

// Short per-request access cache: drawing sends many small POSTs.
const accessCache = new Map<string, { at: number; v: Awaited<ReturnType<typeof getRoomAccess>> }>();
async function cachedAccess(roomId: string, userId: string) {
  const k = `${roomId}:${userId}`;
  const hit = accessCache.get(k);
  if (hit && Date.now() - hit.at < 10_000) return hit.v;
  const v = await getRoomAccess(roomId, userId);
  accessCache.set(k, { at: Date.now(), v });
  if (accessCache.size > 2000) accessCache.clear();
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const user = session?.user as { id?: string; name?: string | null; image?: string | null } | undefined;
  if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

  const roomId = String(req.query.roomId);
  const { room, access } = await cachedAccess(roomId, user.id);
  if (!room || room.isArchived) return res.status(404).json({ error: "Room not found" });
  if (access === "none") return res.status(403).json({ error: "You don't have access to this whiteboard" });

  if (req.method === "GET") {
    return res.status(200).json({ access, participants: participants(roomId), chat: recentChat(roomId) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }

  const { clientId, kind } = req.body ?? {};
  if (typeof clientId !== "string" || !NEEDS[kind]) return res.status(400).json({ error: "Bad request" });
  if (!atLeast(access, NEEDS[kind])) return res.status(403).json({ error: "View-only access" });

  const from = {
    userId: user.id,
    clientId,
    name: user.name ?? "Someone",
    image: user.image ?? null,
    color: colorFor(user.id),
    access,
  };
  const base = { roomId, teamId: room.teamId, kind, from };

  switch (kind) {
    case "update": {
      const updates = Array.isArray(req.body.updates) ? req.body.updates.filter((u: any) => typeof u === "string") : [];
      if (!updates.length) return res.status(400).json({ error: "No updates" });
      await publish(SSE_EVENTS.WHITEBOARD, { ...base, updates });
      break;
    }
    case "sync-req":
      await publish(SSE_EVENTS.WHITEBOARD, base);
      break;
    case "sync-resp":
      if (typeof req.body.state !== "string" || typeof req.body.to !== "string") return res.status(400).json({ error: "Bad request" });
      await publish(SSE_EVENTS.WHITEBOARD, { ...base, to: req.body.to, state: req.body.state });
      break;
    case "presence":
      touch(roomId, from);
      await publish(SSE_EVENTS.WHITEBOARD, base);
      break;
    case "leave":
      leave(roomId, clientId);
      await publish(SSE_EVENTS.WHITEBOARD, base);
      break;
    case "cursor": {
      const x = Number(req.body.x), y = Number(req.body.y);
      if (!isFinite(x) || !isFinite(y)) return res.status(400).json({ error: "Bad cursor" });
      await publish(SSE_EVENTS.WHITEBOARD, { ...base, x, y });
      break;
    }
    case "chat": {
      const text = String(req.body.text ?? "").trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: "Empty message" });
      const msg = { id: randomUUID(), userId: user.id, name: from.name, color: from.color, text, at: Date.now() };
      addChat(roomId, msg);
      await publish(SSE_EVENTS.WHITEBOARD, { ...base, message: msg });
      break;
    }
  }
  return res.status(200).json({ ok: true });
}
