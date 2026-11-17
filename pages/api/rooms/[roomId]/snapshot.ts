
// pages/api/rooms/[roomId]/snapshot.ts
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import * as Y from "yjs"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { atLeast, getRoomAccess } from "@/lib/whiteboard/access"

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } }

const toU8 = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"))
const toB64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64")

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) return res.status(401).json({ error: "Unauthorized" })

  const { roomId } = req.query as { roomId: string }
  const { room, access } = await getRoomAccess(roomId, session.user.id)
  if (!room) return res.status(404).json({ error: "Room not found" })
  if (access === "none") return res.status(403).json({ error: "Forbidden" })

  if (req.method === "GET") {
    const row = await prisma.room.findUnique({ where: { id: roomId }, select: { snapshot: true } })
    return res.status(200).json({ snapshot: row?.snapshot ?? null, access })
  }

  if (req.method === "POST") {
    if (!atLeast(access, "edit")) return res.status(403).json({ error: "View-only access" })
    const { snapshot } = req.body as { snapshot: string }
    if (!snapshot || typeof snapshot !== "string") {
      return res.status(400).json({ error: "Missing or invalid snapshot" })
    }

    // Merge with what's stored so concurrent editors never overwrite each other
    // (Yjs updates are commutative; merging is idempotent).
    const row = await prisma.room.findUnique({ where: { id: roomId }, select: { snapshot: true } })
    let merged = snapshot
    try {
      if (row?.snapshot) merged = toB64(Y.mergeUpdates([toU8(row.snapshot), toU8(snapshot)]))
    } catch (e) {
      console.warn("[whiteboard] merge failed, keeping incoming snapshot:", (e as Error).message)
    }

    await prisma.room.update({ where: { id: roomId }, data: { snapshot: merged, updatedAt: new Date() } })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
