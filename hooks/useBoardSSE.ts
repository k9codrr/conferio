"use client";

// Keeps a kanban board (and any open task modal) in sync in real time.
// Each event is applied to the React Query cache immediately (instant UI),
// then a short debounced refetch reconciles anything the event didn't carry
// (comments, activity, counts, ordering).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSSE } from "./useSSE";

interface Task {
  id: string;
  columnId?: string;
  subtasks?: any[];
  attachments?: any[];
  assignees?: any[];
  labels?: any[];
  _count?: { boardComments: number; attachments?: number; subtasks?: number };
  [key: string]: any;
}

interface BoardData {
  columns: Array<{ id: string; tasks: Task[]; [key: string]: any }>;
  [key: string]: any;
}

export function safeTask(task: Task): Task {
  return {
    ...task,
    subtasks: task.subtasks ?? [],
    attachments: task.attachments ?? [],
    assignees: task.assignees ?? [],
    labels: task.labels ?? [],
    _count: task._count ?? { boardComments: 0, attachments: 0, subtasks: 0 },
  };
}

function mergeTask(prev: Task, next: Task): Task {
  return safeTask({
    ...prev,
    ...next,
    subtasks: next.subtasks ?? prev.subtasks,
    attachments: next.attachments ?? prev.attachments,
    assignees: next.assignees ?? prev.assignees,
    labels: next.labels ?? prev.labels,
    boardComments: next.boardComments ?? prev.boardComments,
    activities: next.activities ?? prev.activities,
  });
}

export function useBoardSSE(boardId: string | string[] | undefined) {
  const queryClient = useQueryClient();
  const id = typeof boardId === "string" ? boardId : undefined;
  const boardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    if (boardTimer.current) clearTimeout(boardTimer.current);
    taskTimers.current.forEach(clearTimeout);
  }, []);

  const refetchBoardSoon = () => {
    if (!id) return;
    if (boardTimer.current) clearTimeout(boardTimer.current);
    boardTimer.current = setTimeout(() => queryClient.invalidateQueries({ queryKey: ["board", id] }), 250);
  };
  const refetchTaskSoon = (taskId?: string) => {
    if (!taskId) return;
    const t = taskTimers.current.get(taskId);
    if (t) clearTimeout(t);
    taskTimers.current.set(
      taskId,
      setTimeout(() => {
        taskTimers.current.delete(taskId);
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }, 150)
    );
  };

  useSSE((data) => {
    if (!id) return;
    if (data.type === "sse:reconnected") {
      queryClient.invalidateQueries({ queryKey: ["board", id] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      return;
    }
    if (data.boardId !== id) return;

    const taskId: string | undefined = data.task?.id ?? data.taskId;

    switch (data.type) {
      case "task:created": {
        if (data.task) {
          queryClient.setQueryData(["board", id], (old: BoardData | undefined) => {
            if (!old) return old;
            const target = data.columnId ?? data.task.columnId;
            if (old.columns.some((c) => c.tasks.some((t) => t.id === data.task.id))) return old;
            return {
              ...old,
              columns: old.columns.map((c) => (c.id === target ? { ...c, tasks: [...c.tasks, safeTask(data.task)] } : c)),
            };
          });
        }
        break;
      }

      case "task:updated": {
        if (data.task) {
          queryClient.setQueryData(["board", id], (old: BoardData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              columns: old.columns.map((c) => ({
                ...c,
                tasks: c.tasks.map((t) => (t.id === data.task.id ? mergeTask(t, data.task) : t)),
              })),
            };
          });
          queryClient.setQueryData(["task", data.task.id], (old: any) => (old ? mergeTask(old, data.task) : old));
        }
        break;
      }

      case "task:moved": {
        queryClient.setQueryData(["board", id], (old: BoardData | undefined) => {
          if (!old) return old;
          let moved: Task | undefined;
          const without = old.columns.map((c) => {
            const found = c.tasks.find((t) => t.id === data.taskId);
            if (found) {
              moved = found;
              return { ...c, tasks: c.tasks.filter((t) => t.id !== data.taskId) };
            }
            return c;
          });
          const insert = mergeTask(moved ?? ({ id: data.taskId } as Task), { ...(data.task ?? {}), id: data.taskId, columnId: data.toColumnId });
          return {
            ...old,
            columns: without.map((c) => (c.id === data.toColumnId ? { ...c, tasks: [...c.tasks, insert] } : c)),
          };
        });
        if (data.task) queryClient.setQueryData(["task", data.taskId], (old: any) => (old ? mergeTask(old, data.task) : old));
        break;
      }

      case "task:deleted": {
        queryClient.setQueryData(["board", id], (old: BoardData | undefined) => {
          if (!old) return old;
          return { ...old, columns: old.columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== data.taskId) })) };
        });
        queryClient.setQueryData(["task", data.taskId], (old: any) => (old ? { ...old, __deleted: true } : old));
        break;
      }
    }

    // Reconcile with the server shortly after (covers fields not in the event).
    refetchBoardSoon();
    if (data.type !== "task:deleted") refetchTaskSoon(taskId);
  });
}
