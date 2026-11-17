// pages/api/teams/[slug]/workload/rebalance.ts
//
// GET  ?memberId=<userId>           → that member's movable items (tasks/docs/files)
// POST { action: "preview_auto" }   → planned moves for an equal balance (no writes)
// POST { action: "auto_balance" }   → compute + apply the equal-balance plan
// POST { action: "bulk_reassign", fromUserId, toUserId, items:[{type,id}] }
// POST { action: "reassign_task" | "reassign_page", ... }  (legacy single-item)
//
// Only team OWNER and ADMIN may use this endpoint.
import type { NextApiRequest, NextApiResponse } from "next";
import { throwIfNoTeamAccess, getCurrentUserWithTeam } from "models/team";
import { prisma } from "@/lib/prisma";
import { recordMetric } from "@/lib/metrics";
import { applyMoves, loadTeamWorkItems, planAutoBalance, type MovableType } from "@/lib/workload/balance";
import { broadcastClipEvent, SSE_EVENTS } from "@/lib/sse";
import { createAndBroadcast } from "@/lib/notifications/notification.broadcast";

const TYPES: MovableType[] = ["task", "page", "file"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await throwIfNoTeamAccess(req, res);
    const user = await getCurrentUserWithTeam(req, res);
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      return res.status(403).json({ error: { message: "Only team owners and admins can rebalance workload" } });
    }

    if (req.method === "GET") return handleGET(req, res, user.team.id);
    if (req.method === "POST") return handlePOST(req, res, user.team.id, user.id);
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message || "Something went wrong" } });
  }
}

async function handleGET(req: NextApiRequest, res: NextApiResponse, teamId: string) {
  const memberId = String(req.query.memberId || "");
  const { items, members } = await loadTeamWorkItems(teamId);
  if (!memberId || !items.has(memberId)) {
    return res.status(400).json({ error: { message: "memberId must be a team member" } });
  }
  res.status(200).json({
    data: {
      items: items.get(memberId)!.sort((a, b) => b.weight - a.weight),
      members: members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    },
  });
}

async function handlePOST(req: NextApiRequest, res: NextApiResponse, teamId: string, actorId: string) {
  const body = req.body || {};
  const action = body.action as string;

  if (action === "preview_auto" || action === "auto_balance") {
    const types: MovableType[] = Array.isArray(body.types)
      ? body.types.filter((t: string) => TYPES.includes(t as MovableType))
      : TYPES;
    const excludeUserIds: string[] = Array.isArray(body.excludeUserIds) ? body.excludeUserIds : [];

    const { members, items, fixed } = await loadTeamWorkItems(teamId);
    const plan = planAutoBalance(members.map((m) => m.userId), items, fixed, { types, excludeUserIds });

    if (action === "preview_auto") {
      return res.status(200).json({ data: { ...plan, members: members.map((m) => ({ userId: m.userId, name: m.user.name })) } });
    }

    const result = await applyMoves(teamId, actorId, plan.moves, "workload_balance");
    await notifyMoved(plan.moves.slice(0, result.applied + result.failed.length), result.failed, actorId);
    recordMetric("workload.rebalanced");
    return res.status(200).json({ data: { ...plan, ...result } });
  }

  if (action === "bulk_reassign") {
    const { fromUserId, toUserId, items } = body as {
      fromUserId: string; toUserId: string; items: { type: MovableType; id: string }[];
    };
    if (!fromUserId || !toUserId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: { message: "fromUserId, toUserId and items are required" } });
    }
    const moves = items
      .filter((i) => TYPES.includes(i.type) && typeof i.id === "string")
      .map((i) => ({ type: i.type, id: i.id, fromUserId, toUserId }));
    const result = await applyMoves(teamId, actorId, moves, "manual_reassign");
    await notifyMoved(moves, result.failed, actorId);
    recordMetric("workload.rebalanced");
    return res.status(200).json({ data: result });
  }

  // Legacy single-item actions kept for existing callers
  if ((action === "reassign_task" && body.taskId) || (action === "reassign_page" && body.pageId)) {
    const move = {
      type: (action === "reassign_task" ? "task" : "page") as MovableType,
      id: body.taskId || body.pageId,
      fromUserId: body.fromUserId,
      toUserId: body.toUserId,
    };
    const result = await applyMoves(teamId, actorId, [move], "manual_reassign");
    if (result.failed.length) return res.status(400).json({ error: { message: result.failed[0].error } });
    await notifyMoved([move], [], actorId);
    return res.status(200).json({ data: { success: true, message: "Reassigned successfully" } });
  }

  return res.status(400).json({ error: { message: "Invalid action or missing parameters" } });
}

/** Tell kanban boards (SSE) and the new assignee (notification) about the moves. */
async function notifyMoved(
  moves: { type: MovableType; id: string; toUserId: string }[],
  failed: { id: string }[],
  actorId: string
) {
  const failedIds = new Set(failed.map((f) => f.id));
  const ok = moves.filter((m) => !failedIds.has(m.id));
  const taskMoves = ok.filter((m) => m.type === "task");

  if (taskMoves.length) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskMoves.map((m) => m.id) } },
      select: { id: true, boardId: true },
    });
    for (const t of tasks) {
      broadcastClipEvent(SSE_EVENTS.TASK_UPDATED, { type: SSE_EVENTS.TASK_UPDATED, boardId: t.boardId, taskId: t.id }).catch(() => {});
    }
  }

  // One notification per receiving user summarising how many items they got.
  const perUser = new Map<string, number>();
  ok.forEach((m) => perUser.set(m.toUserId, (perUser.get(m.toUserId) || 0) + 1));
  await Promise.all(
    [...perUser.entries()].map(([userId, n]) =>
      createAndBroadcast({
        userId,
        type: "TASK_ASSIGNED",
        title: "Work reassigned to you",
        body: `${n} item${n > 1 ? "s were" : " was"} reassigned to you to balance team workload.`,
        data: { reason: "workload_balance", actorId, count: n },
        channels: ["in_app"],
      }).catch(() => null)
    )
  );
}
