// /api/rooms/:roomId/access
// GET → { access, permissions, members[] }   (members list only for managers)
// PUT { roles?, users? }                       (managers only) → live-updates everyone in the room
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish, SSE_EVENTS } from "@/lib/sse";
import { getRoomAccess, setRoomPermissions, resolveAccess } from "@/lib/whiteboard/access";

const level = z.enum(["edit", "view", "none"]);
const putSchema = z.object({
  roles: z.object({ MANAGER: level, MEMBER: level, INTERN: level, CLIENT: level }).partial().optional(),
  users: z.record(z.string(), level.nullable()).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const roomId = String(req.query.roomId);
  const { room, access, perms } = await getRoomAccess(roomId, userId);
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (access === "none") return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    let members: any[] = [];
    if (access === "manage") {
      const rows = await prisma.teamMember.findMany({
        where: { teamId: room.teamId },
        select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } },
      });
      members = rows.map((m) => ({
        ...m.user,
        role: m.role,
        override: perms.users[m.user.id] ?? null,
        effective: resolveAccess(perms, { userId: m.user.id, role: m.role, isCreator: room.createdById === m.user.id }),
      }));
    }
    return res.status(200).json({ access, permissions: perms, members });
  }

  if (req.method === "PUT") {
    if (access !== "manage") return res.status(403).json({ error: "Only owners, admins and the room creator can change access" });
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
    const next = {
      roles: { ...perms.roles, ...(parsed.data.roles ?? {}) },
      users: { ...perms.users },
    };
    for (const [uid, v] of Object.entries(parsed.data.users ?? {})) {
      if (v === null) delete next.users[uid];
      else next.users[uid] = v;
    }
    await setRoomPermissions(roomId, next);
    await publish(SSE_EVENTS.WHITEBOARD, { roomId, teamId: room.teamId, kind: "permissions", from: { userId } });
    return res.status(200).json({ permissions: next });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).end();
}
