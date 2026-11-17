"use client";

// Workload rebalancing (OWNER / ADMIN only — enforced again on the server).
//  • Auto balance: one click computes an equal-score plan, shows before/after,
//    and applies it.
//  • Pick items:   choose exactly which tasks / docs / files move from a loaded
//    member to a less-loaded one.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Scale, CheckCircle2, ArrowRight, Wand2, ListChecks, Loader2,
  ListTodo, FileText, Paperclip, AlertTriangle, Search,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface MemberWorkload {
  memberId: string; memberName: string; memberEmail: string;
  memberImage: string | null; workloadScore: number;
  tasks: { active: number; overdue: number };
  pages: { total: number }; files: { total: number };
}

interface BalanceSuggestion {
  from: string; fromName: string;
  to: string; toName: string;
  reason: string; potentialItems: number;
}

type ItemType = "task" | "page" | "file";
interface MovableItem {
  type: ItemType; id: string; title: string; weight: number;
  priority?: string; status?: string; dueDate?: string | null; overdue?: boolean;
  coAssignees?: string[];
}
interface PlannedMove { type: ItemType; id: string; title: string; weight: number; fromUserId: string; toUserId: string; }
interface Plan { moves: PlannedMove[]; before: Record<string, number>; after: Record<string, number>; }

interface Props {
  teamSlug: string; members: MemberWorkload[]; suggestions: BalanceSuggestion[];
  onClose: () => void; onSuccess: () => void;
}

const TYPE_META: Record<ItemType, { label: string; icon: typeof ListTodo; color: string }> = {
  task: { label: "Tasks", icon: ListTodo, color: "text-violet-600" },
  page: { label: "Docs", icon: FileText, color: "text-blue-600" },
  file: { label: "Files", icon: Paperclip, color: "text-amber-600" },
};
const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const initials = (name: string) => (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

export default function RebalanceModal({ teamSlug, members, suggestions, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"auto" | "pick">("auto");
  const [changed, setChanged] = useState(false);
  const nameOf = useCallback((id: string) => members.find(m => m.memberId === id)?.memberName || "Member", [members]);

  const finish = () => (changed ? onSuccess() : onClose());

  return (
    <>
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 backdrop-blur-sm" onClick={finish} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[95vw] h-[85vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 bg-violet-100 dark:bg-violet-950 rounded-lg flex items-center justify-center">
              <Scale className="size-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Workload Balancing</h2>
              <p className="text-[11px] text-gray-500">Owners and admins only · every move is logged and the new assignee is notified</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={finish}><X className="size-4" /></Button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-800 shrink-0">
          {([
            ["auto", "Auto balance", Wand2],
            ["pick", "Choose what to move", ListChecks],
          ] as const).map(([m, label, Icon]) => (
            <button type="button" key={m} onClick={() => setMode(m)}
              className={cn(
                "px-5 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                mode === m ? "border-violet-600 text-violet-600 dark:text-violet-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {mode === "auto"
            ? <AutoBalance teamSlug={teamSlug} members={members} nameOf={nameOf} onApplied={() => setChanged(true)} />
            : <PickItems teamSlug={teamSlug} members={members} suggestions={suggestions} nameOf={nameOf} onApplied={() => setChanged(true)} />}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-3 flex items-center justify-end bg-gray-50 dark:bg-gray-950 shrink-0">
          <Button variant="outline" size="sm" onClick={finish}>{changed ? "Done" : "Close"}</Button>
        </div>
      </div>
    </>
  );
}

// ─── Auto balance ────────────────────────────────────────────────────────────

function AutoBalance({ teamSlug, members, nameOf, onApplied }: {
  teamSlug: string; members: MemberWorkload[]; nameOf: (id: string) => string; onApplied: () => void;
}) {
  const [types, setTypes] = useState<ItemType[]>(["task", "page", "file"]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ applied: number; failed: { id: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (action: "preview_auto" | "auto_balance") => {
    const res = await fetch(`/api/teams/${teamSlug}/workload/rebalance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, types, excludeUserIds: excluded }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Request failed");
    return json.data;
  }, [teamSlug, types, excluded]);

  useEffect(() => {
    if (result) return; // keep showing the applied result
    let cancelled = false;
    setLoading(true); setError(null);
    call("preview_auto")
      .then(d => { if (!cancelled) setPlan(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [call, result]);

  const apply = async () => {
    setApplying(true); setError(null);
    try {
      const d = await call("auto_balance");
      setPlan(d);
      setResult({ applied: d.applied, failed: d.failed });
      onApplied();
    } catch (e: any) { setError(e.message); }
    finally { setApplying(false); }
  };

  const maxScore = useMemo(() => Math.max(1, ...Object.values(plan?.before || {}), ...Object.values(plan?.after || {})), [plan]);
  const spread = (r?: Record<string, number>) => {
    const v = Object.entries(r || {}).filter(([k]) => !excluded.includes(k)).map(([, s]) => s);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Move</span>
        {(Object.keys(TYPE_META) as ItemType[]).map(t => {
          const on = types.includes(t);
          const { icon: Icon, label } = TYPE_META[t];
          return (
            <button key={t} type="button" disabled={!!result}
              onClick={() => setTypes(p => on ? p.filter(x => x !== t) : [...p, t])}
              className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors",
                on ? "bg-violet-600 border-violet-600 text-white" : "border-gray-300 dark:border-gray-700 text-gray-500")}>
              <Icon className="size-3" />{label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Load before → after</p>
          {plan && (
            <p className="text-[11px] text-gray-500">
              Gap between busiest and least busy: <b className="text-red-500">{spread(plan.before)}</b> → <b className="text-emerald-600">{spread(plan.after)}</b> pts
            </p>
          )}
        </div>
        {members.map(m => {
          const b = plan?.before[m.memberId] ?? m.workloadScore;
          const a = plan?.after[m.memberId] ?? b;
          const isExcluded = excluded.includes(m.memberId);
          return (
            <div key={m.memberId} className={cn("flex items-center gap-3", isExcluded && "opacity-40")}>
              <input type="checkbox" className="accent-violet-600" checked={!isExcluded} disabled={!!result}
                title="Include this member in balancing"
                onChange={() => setExcluded(p => isExcluded ? p.filter(x => x !== m.memberId) : [...p, m.memberId])} />
              <Avatar className="size-6 shrink-0">
                {m.memberImage && <AvatarImage src={m.memberImage} />}
                <AvatarFallback className="text-[9px] font-bold">{initials(m.memberName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-gray-700 dark:text-gray-300 w-32 truncate shrink-0">{m.memberName}</span>
              <div className="flex-1 space-y-1">
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-400 rounded-full" style={{ width: `${(b / maxScore) * 100}%` }} />
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(a / maxScore) * 100}%` }} />
                </div>
              </div>
              <span className="text-xs tabular-nums w-16 text-right">
                <span className="text-gray-400">{b}</span> → <b className="text-gray-900 dark:text-white">{a}</b>
              </span>
            </div>
          );
        })}
        <p className="text-[10px] text-gray-400">Grey = now, violet = after balancing. Untick a member to leave them out (e.g. on leave).</p>
      </div>

      {error && <ErrorBox msg={error} />}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="size-5 animate-spin" /></div>
      ) : plan && plan.moves.length === 0 && !result ? (
        <div className="text-center py-8">
          <CheckCircle2 className="size-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Already as balanced as possible</p>
          <p className="text-xs text-gray-400 mt-1">No single move would make the load more even.</p>
        </div>
      ) : plan ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {result ? `Moved ${result.applied} item${result.applied === 1 ? "" : "s"}` : `${plan.moves.length} planned move${plan.moves.length === 1 ? "" : "s"}`}
          </p>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl">
            {plan.moves.map(mv => {
              const { icon: Icon, color } = TYPE_META[mv.type];
              const failed = result?.failed.find(f => f.id === mv.id);
              return (
                <div key={mv.type + mv.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <Icon className={cn("size-3.5 shrink-0", color)} />
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{mv.title}</span>
                  <span className="text-gray-400 tabular-nums">{mv.weight} pts</span>
                  <span className="text-gray-500 truncate max-w-[110px]">{nameOf(mv.fromUserId)}</span>
                  <ArrowRight className="size-3 text-violet-500 shrink-0" />
                  <span className="text-gray-900 dark:text-white font-medium truncate max-w-[110px]">{nameOf(mv.toUserId)}</span>
                  {result && (failed
                    ? <span title={failed.error}><AlertTriangle className="size-3.5 text-amber-500" /></span>
                    : <CheckCircle2 className="size-3.5 text-emerald-500" />)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!result && plan && plan.moves.length > 0 && (
        <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2" disabled={applying || loading} onClick={apply}>
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          {applying ? "Balancing…" : `Balance now (${plan.moves.length} move${plan.moves.length === 1 ? "" : "s"})`}
        </Button>
      )}
      {result && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
          Workload balanced — {result.applied} item{result.applied === 1 ? "" : "s"} reassigned
          {result.failed.length ? `, ${result.failed.length} skipped (hover the warning icon for why)` : ""}.
        </div>
      )}
    </div>
  );
}

// ─── Pick items ──────────────────────────────────────────────────────────────

function PickItems({ teamSlug, members, suggestions, nameOf, onApplied }: {
  teamSlug: string; members: MemberWorkload[]; suggestions: BalanceSuggestion[];
  nameOf: (id: string) => string; onApplied: () => void;
}) {
  const sorted = useMemo(() => [...members].sort((a, b) => b.workloadScore - a.workloadScore), [members]);
  const [from, setFrom] = useState(suggestions[0]?.from || sorted[0]?.memberId || "");
  const [to, setTo] = useState(suggestions[0]?.to || sorted[sorted.length - 1]?.memberId || "");
  const [items, setItems] = useState<MovableItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(members.map(m => [m.memberId, m.workloadScore])));

  const load = useCallback(async () => {
    if (!from) return;
    setLoading(true); setError(null); setSelected(new Set());
    try {
      const res = await fetch(`/api/teams/${teamSlug}/workload/rebalance?memberId=${encodeURIComponent(from)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Failed to load items");
      setItems(json.data.items);
    } catch (e: any) { setError(e.message); setItems([]); }
    finally { setLoading(false); }
  }, [from, teamSlug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (to === from) setTo(sorted.find(m => m.memberId !== from)?.memberId || ""); }, [from, to, sorted]);

  const key = (i: MovableItem) => `${i.type}:${i.id}`;
  const visible = items.filter(i =>
    (typeFilter === "all" || i.type === typeFilter) &&
    (!q || i.title.toLowerCase().includes(q.toLowerCase()))
  );
  const chosen = items.filter(i => selected.has(key(i)));
  const movedWeight = chosen.filter(i => !(i.type === "task" && i.coAssignees?.includes(to))).reduce((s, i) => s + i.weight, 0);
  const fromScore = scores[from] ?? 0;
  const toScore = scores[to] ?? 0;
  const equalShare = Math.max(0, Math.floor((fromScore - toScore) / 2));

  const toggle = (i: MovableItem) => setSelected(p => {
    const n = new Set(p); n.has(key(i)) ? n.delete(key(i)) : n.add(key(i)); return n;
  });

  // Select items (heaviest first) until the two members are as close as possible.
  const selectToEqualize = () => {
    let need = equalShare;
    const pick = new Set<string>();
    [...visible].filter(i => !(i.type === "task" && i.coAssignees?.includes(to)))
      .sort((a, b) => b.weight - a.weight)
      .forEach(i => { if (i.weight <= need) { pick.add(key(i)); need -= i.weight; } });
    setSelected(pick);
  };

  const submit = async () => {
    if (!chosen.length || !to) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await fetch(`/api/teams/${teamSlug}/workload/rebalance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_reassign", fromUserId: from, toUserId: to, items: chosen.map(i => ({ type: i.type, id: i.id })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Reassign failed");
      const { applied, failed } = json.data as { applied: number; failed: { id: string; error: string }[] };
      const failedIds = new Set(failed.map(f => f.id));
      const movedW = chosen.filter(i => !failedIds.has(i.id)).reduce((s, i) => s + i.weight, 0);
      setScores(s => ({ ...s, [from]: (s[from] ?? 0) - movedW, [to]: (s[to] ?? 0) + movedW }));
      setMessage(`Moved ${applied} item${applied === 1 ? "" : "s"} to ${nameOf(to)}${failed.length ? ` · ${failed.length} skipped: ${failed[0].error}` : ""}.`);
      onApplied();
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-5 pb-3 space-y-3 shrink-0">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <MemberSelect label="Move from" value={from} onChange={setFrom} members={sorted} scores={scores} />
          <ArrowRight className="size-4 text-violet-500 mb-2.5" />
          <MemberSelect label="Move to" value={to} onChange={setTo} members={sorted.filter(m => m.memberId !== from)} scores={scores} />
        </div>

        {from && to && (
          <div className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
            <span className="text-gray-600 dark:text-gray-400">
              After move: <b>{nameOf(from)}</b> {fromScore} → <b className="text-gray-900 dark:text-white">{fromScore - movedWeight}</b>
              {"  ·  "}<b>{nameOf(to)}</b> {toScore} → <b className="text-gray-900 dark:text-white">{toScore + movedWeight}</b>
            </span>
            {equalShare > 0 && (
              <button type="button" onClick={selectToEqualize} className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
                Select to even out (~{equalShare} pts)
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter items…"
              className="w-full h-8 pl-8 pr-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-transparent outline-none focus:border-violet-500" />
          </div>
          {(["all", "task", "page", "file"] as const).map(t => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)}
              className={cn("px-2.5 h-8 rounded-md text-xs border",
                typeFilter === t ? "bg-violet-600 border-violet-600 text-white" : "border-gray-200 dark:border-gray-700 text-gray-500")}>
              {t === "all" ? "All" : TYPE_META[t].label} {t !== "all" && `(${items.filter(i => i.type === t).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="size-5 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-10">{nameOf(from)} has no open items to move{typeFilter !== "all" ? " of this type" : ""}.</p>
        ) : (
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
            <label className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-gray-500 bg-gray-50 dark:bg-gray-950 rounded-t-xl cursor-pointer">
              <input type="checkbox" className="accent-violet-600"
                checked={visible.length > 0 && visible.every(i => selected.has(key(i)))}
                onChange={e => setSelected(p => {
                  const n = new Set(p); visible.forEach(i => e.target.checked ? n.add(key(i)) : n.delete(key(i))); return n;
                })} />
              Select all shown ({visible.length})
            </label>
            {visible.map(i => {
              const { icon: Icon, color } = TYPE_META[i.type];
              const shared = i.type === "task" && i.coAssignees?.includes(to);
              return (
                <label key={key(i)} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <input type="checkbox" className="accent-violet-600" checked={selected.has(key(i))} onChange={() => toggle(i)} />
                  <Icon className={cn("size-3.5 shrink-0", color)} />
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{i.title}</span>
                  {shared && <span className="text-[10px] text-gray-400">already shared with {nameOf(to)}</span>}
                  {i.overdue && <span className="text-[10px] font-semibold text-red-500">Overdue</span>}
                  {i.priority && <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", PRIORITY_STYLE[i.priority])}>{i.priority}</span>}
                  <span className="text-gray-400 tabular-nums w-10 text-right">{i.weight} pts</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-5 pt-3 space-y-2 shrink-0">
        {error && <ErrorBox msg={error} />}
        {message && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-2.5">{message}</div>
        )}
        <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2" disabled={saving || !chosen.length || !to} onClick={submit}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {chosen.length ? `Move ${chosen.length} item${chosen.length === 1 ? "" : "s"} to ${nameOf(to)}` : "Select items to move"}
        </Button>
      </div>
    </div>
  );
}

function MemberSelect({ label, value, onChange, members, scores }: {
  label: string; value: string; onChange: (v: string) => void; members: MemberWorkload[]; scores: Record<string, number>;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select member…" /></SelectTrigger>
        <SelectContent>
          {members.map(m => (
            <SelectItem key={m.memberId} value={m.memberId}>{m.memberName} · {scores[m.memberId] ?? m.workloadScore} pts</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-2.5">{msg}</div>
  );
}
