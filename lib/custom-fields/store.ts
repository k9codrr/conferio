// lib/custom-fields/store.ts
// ClickUp-style custom fields for tasks, docs, notes, reminders and events.
// (CRM keeps its own richer field system in lib/crm.)
//
// Storage: PlatformSetting key/value rows — no schema change needed:
//   cf-defs:<teamId>:<entity>    → FieldDef[]
//   cf-vals:<entity>:<recordId>  → { [fieldId]: value }
// Everything goes through this module, so it can move to dedicated tables later.
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { MODULE_COOKIE } from '@/lib/platform/modules';

export const CF_ENTITIES = ['task', 'doc', 'note', 'reminder', 'event'] as const;
export type CfEntity = (typeof CF_ENTITIES)[number];

export const CF_TYPES = [
  'text', 'long_text', 'number', 'currency', 'date', 'checkbox', 'select', 'multi_select',
  'url', 'email', 'phone', 'rating', 'progress', 'person',
] as const;
export type CfType = (typeof CF_TYPES)[number];

export interface FieldOption { id: string; label: string; color: string }
export interface FieldDef {
  id: string;
  name: string;
  type: CfType;
  options?: FieldOption[];  // select / multi_select
  currency?: string;        // currency
  required?: boolean;
  description?: string;
  createdAt: string;
}

const defsKey = (teamId: string, entity: CfEntity) => `cf-defs:${teamId}:${entity}`;
const valsKey = (entity: CfEntity, id: string) => `cf-vals:${entity}:${id}`;

export const isEntity = (v: unknown): v is CfEntity => (CF_ENTITIES as readonly string[]).includes(v as string);

// ── Team resolution & permissions ────────────────────────────────────────────

export async function resolveTeam(userId: string, teamSlug?: string | null, cookies?: Partial<Record<string, string>>) {
  const slug = teamSlug || cookies?.[MODULE_COOKIE] || null;
  const m =
    (slug ? await prisma.teamMember.findFirst({ where: { userId, team: { slug: decodeURIComponent(slug) } }, select: { teamId: true, role: true } }) : null) ??
    (await prisma.teamMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { teamId: true, role: true } }));
  return m ? { teamId: m.teamId, role: m.role as string } : null;
}

export const canManageFields = (role: string | null) => role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';

/** Can this user see/edit values on this record? Returns the record's team (docs) if any. */
export async function recordAccess(userId: string, entity: CfEntity, id: string): Promise<{ ok: boolean; teamId?: string; boardId?: string }> {
  switch (entity) {
    case 'task': {
      const t = await prisma.task.findFirst({
        where: { id, column: { board: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } } },
        select: { boardId: true },
      });
      return { ok: !!t, boardId: t?.boardId };
    }
    case 'doc': {
      const p = await prisma.page.findFirst({
        where: { id, team: { members: { some: { userId } } }, OR: [{ authorId: userId }, { visibility: { not: 'PRIVATE' } }] },
        select: { teamId: true },
      });
      return { ok: !!p, teamId: p?.teamId };
    }
    case 'note':
      return { ok: !!(await prisma.note.findFirst({ where: { id, authorId: userId }, select: { id: true } })) };
    case 'reminder': {
      // Reminder rows and dashboard to-dos (MyTask) share the "reminder" entity.
      const [r, t] = await Promise.all([
        prisma.reminder.findFirst({ where: { id, userId }, select: { id: true } }),
        prisma.myTask.findFirst({ where: { id, userId }, select: { id: true } }),
      ]);
      return { ok: !!(r || t) };
    }
    case 'event':
      return { ok: !!(await prisma.event.findFirst({ where: { id, userId }, select: { id: true } })) };
  }
}

// ── Definitions ──────────────────────────────────────────────────────────────

export async function getDefs(teamId: string, entity: CfEntity): Promise<FieldDef[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: defsKey(teamId, entity) } });
  return Array.isArray(row?.value) ? (row!.value as unknown as FieldDef[]) : [];
}

async function putDefs(teamId: string, entity: CfEntity, defs: FieldDef[]) {
  await prisma.platformSetting.upsert({
    where: { key: defsKey(teamId, entity) },
    create: { key: defsKey(teamId, entity), value: defs as any },
    update: { value: defs as any },
  });
}

const PALETTE = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

function cleanDef(input: any, existing?: FieldDef): FieldDef {
  const type: CfType = (CF_TYPES as readonly string[]).includes(input?.type) ? input.type : existing?.type ?? 'text';
  const name = String(input?.name ?? existing?.name ?? '').trim().slice(0, 60);
  if (!name) throw Object.assign(new Error('Field name is required'), { status: 400 });
  const def: FieldDef = {
    id: existing?.id ?? randomUUID(),
    name,
    type,
    required: !!(input?.required ?? existing?.required),
    description: String(input?.description ?? existing?.description ?? '').slice(0, 200) || undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  if (type === 'select' || type === 'multi_select') {
    const opts = Array.isArray(input?.options) ? input.options : existing?.options ?? [];
    def.options = opts
      .filter((o: any) => o && String(o.label ?? '').trim())
      .slice(0, 50)
      .map((o: any, i: number) => ({
        id: typeof o.id === 'string' && o.id ? o.id : randomUUID(),
        label: String(o.label).trim().slice(0, 40),
        color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : PALETTE[i % PALETTE.length],
      }));
  }
  if (type === 'currency') def.currency = String(input?.currency ?? existing?.currency ?? 'USD').slice(0, 3).toUpperCase();
  return def;
}

export async function createDef(teamId: string, entity: CfEntity, input: any) {
  const defs = await getDefs(teamId, entity);
  if (defs.length >= 50) throw Object.assign(new Error('Maximum of 50 fields'), { status: 400 });
  const def = cleanDef(input);
  await putDefs(teamId, entity, [...defs, def]);
  return def;
}

export async function updateDef(teamId: string, entity: CfEntity, id: string, input: any) {
  const defs = await getDefs(teamId, entity);
  const i = defs.findIndex((d) => d.id === id);
  if (i < 0) throw Object.assign(new Error('Field not found'), { status: 404 });
  defs[i] = cleanDef(input, defs[i]);
  await putDefs(teamId, entity, defs);
  return defs[i];
}

export async function deleteDef(teamId: string, entity: CfEntity, id: string) {
  const defs = await getDefs(teamId, entity);
  await putDefs(teamId, entity, defs.filter((d) => d.id !== id));
}

export async function reorderDefs(teamId: string, entity: CfEntity, order: string[]) {
  const defs = await getDefs(teamId, entity);
  const pos = new Map(order.map((id, i) => [id, i]));
  defs.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  await putDefs(teamId, entity, defs);
  return defs;
}

// ── Values ───────────────────────────────────────────────────────────────────

export function validateValue(def: FieldDef, v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  const bad = () => { throw Object.assign(new Error(`Invalid value for "${def.name}"`), { status: 400 }); };
  switch (def.type) {
    case 'text': return String(v).slice(0, 500);
    case 'long_text': return String(v).slice(0, 5000);
    case 'number': case 'currency': { const n = Number(v); return isFinite(n) ? n : bad(); }
    case 'rating': { const n = Math.round(Number(v)); return n >= 0 && n <= 5 ? n : bad(); }
    case 'progress': { const n = Math.round(Number(v)); return n >= 0 && n <= 100 ? n : bad(); }
    case 'checkbox': return !!v;
    case 'date': { const d = new Date(String(v)); return isNaN(+d) ? bad() : d.toISOString(); }
    case 'url': { const s = String(v).trim(); return /^https?:\/\//i.test(s) ? s.slice(0, 2000) : `https://${s}`.slice(0, 2000); }
    case 'email': { const s = String(v).trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : bad(); }
    case 'phone': return String(v).replace(/[^\d+()\-\s]/g, '').slice(0, 30);
    case 'select': return def.options?.some((o) => o.id === v) ? v : bad();
    case 'multi_select': return Array.isArray(v) ? v.filter((x) => def.options?.some((o) => o.id === x)) : bad();
    case 'person': return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : typeof v === 'string' ? [v] : bad();
  }
}

export async function getValues(entity: CfEntity, ids: string[]): Promise<Record<string, Record<string, unknown>>> {
  if (!ids.length) return {};
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: ids.map((id) => valsKey(entity, id)) } } });
  const out: Record<string, Record<string, unknown>> = {};
  rows.forEach((r) => { out[r.key.slice(`cf-vals:${entity}:`.length)] = (r.value ?? {}) as Record<string, unknown>; });
  return out;
}

export async function setValues(entity: CfEntity, id: string, defs: FieldDef[], patch: Record<string, unknown>) {
  const current = (await getValues(entity, [id]))[id] ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const [fieldId, raw] of Object.entries(patch)) {
    const def = defs.find((d) => d.id === fieldId);
    if (!def) continue;
    const v = validateValue(def, raw);
    if (v === null || (Array.isArray(v) && !v.length)) delete next[fieldId];
    else next[fieldId] = v;
  }
  await prisma.platformSetting.upsert({
    where: { key: valsKey(entity, id) },
    create: { key: valsKey(entity, id), value: next as any },
    update: { value: next as any },
  });
  return next;
}
