"use client";

// Global reminder alarm: rings, shows a sticky card with Snooze / Done, and a
// browser notification when the tab is in the background. Driven by the
// `reminder:due` realtime event from lib/reminders/dispatcher.ts.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlarmClock, BellOff, Check, X } from "lucide-react";
import { useSSE } from "hooks/useSSE";
import { bindAudioUnlock, playReminderSound } from "./sounds";

interface DueReminder {
  id: string;
  kind: "reminder" | "mytask" | "voice";
  title: string;
  description?: string;
  dueAt: string;
}

export default function ReminderAlarm() {
  const { status } = useSession();
  const [queue, setQueue] = useState<DueReminder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    bindAudioUnlock();
  }, []);

  useSSE((data) => {
    if (status !== "authenticated" || data.type !== "reminder:due" || !data.reminder) return;
    const r = data.reminder as DueReminder;
    setQueue((q) => (q.some((x) => x.kind === r.kind && x.id === r.id) ? q : [...q, r]));
    playReminderSound();
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(`⏰ ${r.title}`, { body: r.description || "Reminder due now", tag: `${r.kind}:${r.id}` });
      }
    } catch {
      /* notifications unsupported */
    }
  });

  // Ask for browser-notification permission once, after the user interacts.
  useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const ask = () => {
      Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, [status]);

  const dismiss = (r: DueReminder) => setQueue((q) => q.filter((x) => !(x.kind === r.kind && x.id === r.id)));

  const snooze = async (r: DueReminder, minutes: number) => {
    setBusy(`${r.kind}:${r.id}`);
    try {
      await fetch(`/api/reminders/${encodeURIComponent(`${r.kind}:${r.id}`)}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
    } finally {
      setBusy(null);
      dismiss(r);
    }
  };

  const done = async (r: DueReminder) => {
    setBusy(`${r.kind}:${r.id}`);
    try {
      if (r.kind === "reminder") {
        await fetch(`/api/reminders/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });
      } else if (r.kind === "mytask") {
        await fetch(`/api/task`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id, itsDone: true }),
        }).catch(() => {});
      }
    } finally {
      setBusy(null);
      dismiss(r);
    }
  };

  if (!queue.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {queue.slice(-3).map((r) => {
        const key = `${r.kind}:${r.id}`;
        return (
          <div key={key} role="alert"
            className="rounded-xl border border-amber-300 bg-white p-3 shadow-2xl dark:border-amber-700/60 dark:bg-neutral-900 animate-in slide-in-from-bottom-2">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <AlarmClock className="size-4 animate-pulse text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Reminder</p>
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{r.title}</p>
                {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{r.description}</p>}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(r)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {[5, 10, 30].map((m) => (
                <button key={m} type="button" disabled={busy === key} onClick={() => snooze(r, m)}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800">
                  <BellOff className="size-3" />{m}m
                </button>
              ))}
              {r.kind !== "voice" && (
                <button type="button" disabled={busy === key} onClick={() => done(r)}
                  className="ml-auto flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                  <Check className="size-3" />Done
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
