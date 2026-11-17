// lib/workload/balance.ts
// Workload balancing engine used by /api/teams/[slug]/workload/rebalance.
//
// Weights mirror the workload score in /api/teams/[slug]/workload so that
// "balanced" here means "equal score" on the dashboard. Reminders are personal
// and never moved; they still count toward a member's fixed (unmovable) load.
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";

export type MovableType = "task" | "page" | "file";

export interface MovableItem {
  type: MovableType;
  id: string;
  title: string;
  weight: number;
  priority?: string;
  status?: string;
  dueDate?: string | null;
  overdue?: boolean;
  boardId?: string;
  /** Other assignees on a task besides the owner of this list */
  coAssignees?: string[];
}

export interface PlannedMove {
  type: MovableType;
  id: string;
  title: string;
  weight: number;
  fromUserId: string;
  toUserId: string;
}

const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 10, HIGH: 7, MEDIUM: 5, LOW: 3 };
const OVERDUE_WEIGHT = 8;
const PAGE_WEIGHT = 4;
const FILE_WEIGHT = 2;
const REMINDER_WEIGHT = 3;

export function taskWeight(t: { priority: string; dueDate: Date | null }, now = new Date()) {
  let w = PRIORITY_WEIGHT[t.priority] ?? 5;
  if (t.dueDate && t.dueDate < now) w += OVERDUE_WEIGHT;
  return w;
}

/** Everything movable per member + the fixed load that can't be moved. */
export async function loadTeamWorkItems(teamId: string) {
  const now = new Date();
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { id: true, userId: true, role: true, user: { select: { name: true, email: true } } },
  });
  const userIds = members.map((m) => m.userId);
  const memberIdToUser = new Map(members.map((m) => [m.id, m.userId]));

  const [assignees, pages, files, reminders] = await Promise.all([
    prisma.taskAssignee.findMany({
      where: { userId: { in: userIds }, task: { status: { not: "DONE" }, isArchived: false } },
      select: {
        userId: true,
        task: {
          select: {
            id: true, title: true, priority: true, status: true, dueDate: true, boardId: true,
            assignees: { select: { userId: true } },
          },
        },
      },
    }),
    prisma.page.findMany({
      where: { teamId, isTemplate: false, assignedToId: { in: members.map((m) => m.id) } },
      select: { id: true, title: true, assignedToId: true },
    }),
    prisma.fileAssignment.findMany({
      where: { userId: { in: userIds }, file: { teamId } },
      select: { userId: true, fileId: true, file: { select: { originalName: true } } },
    }),
    prisma.reminder.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "PENDING" },
      _count: { _all: true },
    }),
  ]);

  const items = new Map<string, MovableItem[]>(userIds.map((u) => [u, []]));
  const fixed = new Map<string, number>(userIds.map((u) => [u, 0]));

  for (const a of assignees) {
    const t = a.task;
    items.get(a.userId)!.push({
      type: "task",
      id: t.id,
      title: t.title,
      weight: taskWeight(t, now),
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
      overdue: !!(t.dueDate && t.dueDate < now),
      boardId: t.boardId,
      coAssignees: t.assignees.map((x) => x.userId).filter((u) => u !== a.userId),
    });
  }
  for (const p of pages) {
    const uid = memberIdToUser.get(p.assignedToId!);
    if (uid) items.get(uid)!.push({ type: "page", id: p.id, title: p.title || "Untitled doc", weight: PAGE_WEIGHT });
  }
  for (const f of files) {
    items.get(f.userId)?.push({ type: "file", id: f.fileId, title: f.file.originalName, weight: FILE_WEIGHT });
  }
  for (const r of reminders) {
    fixed.set(r.userId, (fixed.get(r.userId) || 0) + r._count._all * REMINDER_WEIGHT);
  }

  return { members, items, fixed };
}

/**
 * Greedy balancing: repeatedly move one item from the most-loaded member to the
 * least-loaded one, picking the item whose weight best halves the gap. Stops
 * when no move would reduce the gap. Items shared with the target are skipped
 * (the target already has them).
 */
export function planAutoBalance(
  userIds: string[],
  items: Map<string, MovableItem[]>,
  fixed: Map<string, number>,
  opts: { types?: MovableType[]; excludeUserIds?: string[]; maxMoves?: number } = {}
): { moves: PlannedMove[]; before: Record<string, number>; after: Record<string, number> } {
  const types = new Set(opts.types ?? ["task", "page", "file"]);
  const pool = userIds.filter((u) => !opts.excludeUserIds?.includes(u));
  const maxMoves = opts.maxMoves ?? 500;

  // Working copy
  const work = new Map<string, MovableItem[]>(pool.map((u) => [u, [...(items.get(u) || [])]]));
  const score = (u: string) =>
    (fixed.get(u) || 0) + (items.get(u) || []).reduce((s, i) => s + i.weight, 0);
  const load = new Map<string, number>(pool.map((u) => [u, score(u)]));
  const before = Object.fromEntries(userIds.map((u) => [u, score(u)]));

  const moves: PlannedMove[] = [];
  const movedIds = new Set<string>(); // never move the same item twice

  while (moves.length < maxMoves && pool.length > 1) {
    const sorted = [...pool].sort((a, b) => load.get(b)! - load.get(a)!);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    const gap = load.get(hi)! - load.get(lo)!;
    if (gap <= 0) break;

    const candidates = work.get(hi)!.filter(
      (i) =>
        types.has(i.type) &&
        !movedIds.has(`${i.type}:${i.id}`) &&
        i.weight < gap && // only moves that strictly shrink the gap
        !(i.type === "task" && i.coAssignees?.includes(lo))
    );
    if (!candidates.length) break;

    // Best fit: weight closest to gap/2
    const target = gap / 2;
    candidates.sort((a, b) => Math.abs(a.weight - target) - Math.abs(b.weight - target));
    const pick = candidates[0];

    moves.push({ type: pick.type, id: pick.id, title: pick.title, weight: pick.weight, fromUserId: hi, toUserId: lo });
    movedIds.add(`${pick.type}:${pick.id}`);
    work.set(hi, work.get(hi)!.filter((i) => i !== pick));
    work.get(lo)!.push(pick);
    load.set(hi, load.get(hi)! - pick.weight);
    load.set(lo, load.get(lo)! + pick.weight);
  }

  const after = { ...before, ...Object.fromEntries(load) };
  return { moves, before, after };
}

/** Apply moves. Tasks also give the new assignee board access if missing. */
export async function applyMoves(
  teamId: string,
  actorId: string,
  moves: Array<Pick<PlannedMove, "type" | "id" | "fromUserId" | "toUserId">>,
  reason: "workload_balance" | "manual_reassign"
) {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { id: true, userId: true },
  });
  const tmByUser = new Map(members.map((m) => [m.userId, m.id]));
  const userNames = new Map(
    (await prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name])
  );

  let applied = 0;
  const failed: { id: string; type: string; error: string }[] = [];

  for (const m of moves) {
    if (!tmByUser.has(m.fromUserId) || !tmByUser.has(m.toUserId) || m.fromUserId === m.toUserId) {
      failed.push({ id: m.id, type: m.type, error: "Both users must be different team members" });
      continue;
    }
    try {
      if (m.type === "task") {
        const task = await prisma.task.findUnique({ where: { id: m.id }, select: { id: true, boardId: true, title: true } });
        if (!task) throw new Error("Task not found");
        const owned = await prisma.taskAssignee.findUnique({
          where: { taskId_userId: { taskId: m.id, userId: m.fromUserId } },
        });
        if (!owned) throw new Error("Task is not assigned to the source member");
        await prisma.$transaction([
          prisma.taskAssignee.delete({ where: { taskId_userId: { taskId: m.id, userId: m.fromUserId } } }),
          prisma.taskAssignee.upsert({
            where: { taskId_userId: { taskId: m.id, userId: m.toUserId } },
            create: { taskId: m.id, userId: m.toUserId, assignedBy: actorId },
            update: { assignedBy: actorId },
          }),
          prisma.boardMember.upsert({
            where: { boardId_userId: { boardId: task.boardId, userId: m.toUserId } },
            create: { boardId: task.boardId, userId: m.toUserId, role: "MEMBER" },
            update: {},
          }),
          prisma.activityLog.create({
            data: {
              action: "REASSIGNED",
              entityType: "TASK",
              entityId: m.id,
              description: `Task reassigned from ${userNames.get(m.fromUserId) || "member"} to ${userNames.get(m.toUserId) || "member"} (${reason === "workload_balance" ? "auto-balance" : "workload rebalance"})`,
              userId: actorId,
              taskId: m.id,
              boardId: task.boardId,
              metadata: { fromUserId: m.fromUserId, toUserId: m.toUserId, reason },
            },
          }),
        ]);
      } else if (m.type === "page") {
        const res = await prisma.page.updateMany({
          where: { id: m.id, teamId, assignedToId: tmByUser.get(m.fromUserId) },
          data: { assignedToId: tmByUser.get(m.toUserId), assignedById: actorId },
        });
        if (!res.count) throw new Error("Doc is not assigned to the source member");
      } else if (m.type === "file") {
        const existing = await prisma.fileAssignment.findUnique({
          where: { fileId_userId: { fileId: m.id, userId: m.fromUserId } },
        });
        if (!existing) throw new Error("File is not assigned to the source member");
        await prisma.$transaction([
          prisma.fileAssignment.delete({ where: { fileId_userId: { fileId: m.id, userId: m.fromUserId } } }),
          prisma.fileAssignment.upsert({
            where: { fileId_userId: { fileId: m.id, userId: m.toUserId } },
            create: { fileId: m.id, userId: m.toUserId, assignedBy: actorId },
            update: { assignedBy: actorId },
          }),
        ]);
      }
      applied++;
    } catch (e: any) {
      failed.push({ id: m.id, type: m.type, error: e?.message || "Failed" });
    }
  }

  await Promise.all([cacheDel(`workload:v2:${teamId}`), cacheDel(`workload:${teamId}`)]);
  return { applied, failed };
}
