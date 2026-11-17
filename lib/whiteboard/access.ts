// lib/whiteboard/access.ts
// Role-based access for whiteboard rooms.
//
//   manage → edit + change access + rename/archive   (team OWNER/ADMIN, room creator)
//   edit   → draw / change the board
//   view   → watch live, chat, no edits
//   none   → cannot open the room
//
// Per-room settings live in PlatformSetting under `room-access:<roomId>`
// (no schema change). Defaults: MANAGER/MEMBER edit, INTERN edit, CLIENT view.
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RoomAccess = "manage" | "edit" | "view" | "none";
export type GrantableAccess = "edit" | "view" | "none";

export interface RoomPermissions {
  roles: Partial<Record<Role, GrantableAccess>>;
  /** Per-user overrides (userId → access); beat the role setting. */
  users: Record<string, GrantableAccess>;
}

export const DEFAULT_PERMISSIONS: RoomPermissions = {
  roles: { MANAGER: "edit", MEMBER: "edit", INTERN: "edit", CLIENT: "view" },
  users: {},
};

const RANK: Record<RoomAccess, number> = { none: 0, view: 1, edit: 2, manage: 3 };
export const atLeast = (a: RoomAccess, min: RoomAccess) => RANK[a] >= RANK[min];

const key = (roomId: string) => `room-access:${roomId}`;

export async function getRoomPermissions(roomId: string): Promise<RoomPermissions> {
  const row = await prisma.platformSetting.findUnique({ where: { key: key(roomId) } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<RoomPermissions>;
  return {
    roles: { ...DEFAULT_PERMISSIONS.roles, ...(v.roles ?? {}) },
    users: { ...(v.users ?? {}) },
  };
}

export async function setRoomPermissions(roomId: string, perms: RoomPermissions) {
  await prisma.platformSetting.upsert({
    where: { key: key(roomId) },
    create: { key: key(roomId), value: perms as any },
    update: { value: perms as any },
  });
}

export function resolveAccess(
  perms: RoomPermissions,
  opts: { userId: string; role: Role | null; isCreator: boolean }
): RoomAccess {
  if (!opts.role) return "none"; // not a team member
  if (opts.role === "OWNER" || opts.role === "ADMIN" || opts.isCreator) return "manage";
  const override = perms.users[opts.userId];
  if (override) return override;
  return perms.roles[opts.role] ?? "view";
}

/** Load room + the caller's membership and work out what they may do. */
export async function getRoomAccess(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true, name: true, slug: true, teamId: true, createdById: true, isArchived: true,
      team: { select: { slug: true, name: true, members: { where: { userId }, select: { role: true } } } },
    },
  });
  if (!room) return { room: null, access: "none" as RoomAccess, role: null, perms: DEFAULT_PERMISSIONS };
  const role = room.team.members[0]?.role ?? null;
  const perms = await getRoomPermissions(roomId);
  const access = resolveAccess(perms, { userId, role, isCreator: room.createdById === userId });
  return { room, access, role, perms };
}

/** Batch: drop rooms the user can't open (one query for all room settings). */
export async function filterAccessibleRooms<T extends { id: string; createdById: string }>(
  rooms: T[],
  userId: string,
  role: Role
): Promise<Array<T & { access: RoomAccess }>> {
  if (!rooms.length) return [];
  const rows = await prisma.platformSetting
    .findMany({ where: { key: { in: rooms.map((r) => key(r.id)) } } })
    .catch(() => [] as { key: string; value: unknown }[]);
  const byKey = new Map<string, Partial<RoomPermissions>>();
  rows.forEach((r) => byKey.set(r.key, (r.value ?? {}) as Partial<RoomPermissions>));
  return rooms
    .map((r) => {
      const v: Partial<RoomPermissions> = byKey.get(key(r.id)) ?? {};
      const perms: RoomPermissions = {
        roles: { ...DEFAULT_PERMISSIONS.roles, ...(v.roles ?? {}) },
        users: { ...(v.users ?? {}) },
      };
      return { ...r, access: resolveAccess(perms, { userId, role, isCreator: r.createdById === userId }) };
    })
    .filter((r) => r.access !== "none");
}
